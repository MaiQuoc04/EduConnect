import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPromoteOptions, listAllStudents, promoteStudents } from '../../api/students.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import TargetClassPicker from './TargetClassPicker.jsx';
import './PromoteStudentsPanel.css';

// The server's limit per request (UC-11, MAX_PROMOTE_STUDENTS); checked here too so School Manager knows early.
const MAX_STUDENTS = 200;
const PROMOTE_ERROR = 'Không lên lớp được. Chưa có học sinh nào được ghi nhận. Vui lòng thử lại.';
const ROSTER_ERROR = 'Không tải được danh sách học sinh của lớp. Vui lòng thử lại.';
const YEARS_ERROR = 'Không tải được danh sách năm học. Vui lòng thử lại.';
const CLASSES_ERROR = 'Không tải được danh sách lớp. Vui lòng thử lại.';
const ENROLLMENT_LABELS = { STUDYING: 'Đang học', TRANSFERRED: 'Đã chuyển lớp', DROPPED: 'Đã nghỉ học' };
const GROUP_LABELS = { GENERAL: 'Nhóm chung', STUDENT: 'Nhóm học sinh', PARENT: 'Nhóm phụ huynh' };

// TODO messages.js: these codes are waiting for the team lead's approval (with the other FE-02 codes). Until then
// the Vietnamese text lives here; errorText() wins as soon as messages.js has the code.
const PROMOTE_ERRORS = {
  MSG_SAME_SCHOOL_YEAR: 'Năm học đích phải khác năm học nguồn. Chuyển lớp trong cùng năm thì dùng chức năng chuyển lớp.',
  MSG_INVALID_YEAR_ORDER: 'Năm học đích phải bắt đầu sau năm học nguồn.',
  MSG_DUPLICATE_STUDENT_IN_REQUEST: 'Có học sinh được chọn nhiều lần. Mỗi học sinh chỉ thuộc một lớp đích.',
  MSG_TOO_MANY_STUDENTS: `Mỗi lần chỉ xử lý tối đa ${MAX_STUDENTS} học sinh.`,
  MSG_SCHOOL_YEAR_NOT_FOUND: 'Không tìm thấy năm học.',
  MSG_CLASS_NOT_FOUND: 'Không tìm thấy lớp học.',
  MSG_INVALID_PARAM: 'Dữ liệu gửi đi không hợp lệ. Vui lòng tải lại trang và thử lại.',
};

// Per-student reasons of a SKIPPED result (results[].message is English, CLAUDE.md). Same TODO as above.
const SKIP_REASONS = {
  SKIP_NO_ACTIVE_ENROLLMENT: 'Học sinh không còn theo học lớp nào trong năm học nguồn.',
  SKIP_ALREADY_ENROLLED: 'Học sinh đã được xếp lớp trong năm học đích.',
  SKIP_STUDENT_NOT_FOUND: 'Không tìm thấy học sinh.',
  SKIP_CLASS_ENROLLMENT_EXISTS: 'Học sinh đã từng học ở lớp này.',
};
const SKIP_FALLBACK = 'Học sinh chưa đủ điều kiện lên lớp.';

// Warnings of a promotion are about a whole class of students, while the server's English text (shared with UC-10)
// speaks of one student; these plural sentences are used for UC-11 even once messages.js has the UC-10 text.
// TODO backend: make the WARN_* message neutral for a batch.
const WARNING_TEXTS = {
  WARN_CLASS_HAS_NO_GROUPS: (d) =>
    `Lớp ${d?.className ?? 'đích'} chưa có nhóm lớp, các học sinh và phụ huynh chưa được thêm vào nhóm nào.`,
  WARN_CLASS_GROUPS_MISSING: (d) => {
    const missing = (d?.missingGroupTypes ?? []).map((t) => GROUP_LABELS[t] ?? t).join(', ');
    return `Lớp ${d?.className ?? 'đích'} còn thiếu ${missing ? missing.toLowerCase() : 'một số nhóm lớp'}, học sinh và phụ huynh chưa được thêm vào các nhóm đó.`;
  },
};
const WARNING_FALLBACK = 'Lên lớp đã hoàn tất nhưng còn một việc chưa thực hiện được. Vui lòng kiểm tra lại nhóm lớp.';

const yearLabel = (name) => String(name ?? '').replace('-', ' – ');
const yearText = (year) => (year ? `Năm học ${yearLabel(year.name)}` : '');
const classText = (target) => (target ? `Lớp ${target.className}` : '');
function promoteErrorText(err) {
  const general = errorText({ code: 'SERVER_ERROR' });
  const known = errorText({ code: err.code, details: err.details });
  if (known !== general || err.code === 'SERVER_ERROR') return err.code === 'SERVER_ERROR' ? PROMOTE_ERROR : known;
  if (PROMOTE_ERRORS[err.code]) return PROMOTE_ERRORS[err.code];
  console.warn(`[PromoteStudents] No Vietnamese message for error code ${err.code}:`, err.message);
  return PROMOTE_ERROR;
}

function skipText({ reason, message }) {
  const known = errorText({ code: reason });
  if (known !== errorText({ code: 'SERVER_ERROR' }) && known !== message) return known;
  if (SKIP_REASONS[reason]) return SKIP_REASONS[reason];
  console.warn(`[PromoteStudents] No Vietnamese message for skip reason ${reason}:`, message);
  return SKIP_FALLBACK;
}

function warningText({ code, details, message }) {
  if (WARNING_TEXTS[code]) return WARNING_TEXTS[code](details);
  console.warn(`[PromoteStudents] No Vietnamese message for warning code ${code}:`, message);
  return WARNING_FALLBACK;
}

// School years of GET /students/promote/options ({ schoolYearId, yearName, startDate, isCurrent }, by start_date),
// kept on the page as { id, name, startDate }.
const asYear = (y) => (y ? { id: y.schoolYearId, name: y.yearName, startDate: y.startDate } : null);

// Default source year: the current one (isCurrent). Between two years (summer break) none is current.
// ASSUMPTION: then the latest year that has already started, else the earliest one – the same choice as the
// server's resolveSchoolYearId for "the current year". Dates are "YYYY-MM-DD" strings (db.js), compared as text.
function defaultSourceYear(years, today) {
  return years.find((y) => y.isCurrent) ?? [...years].reverse().find((y) => y.startDate <= today) ?? years[0] ?? null;
}

// Destination years: the ones that start after the source year, by start_date (never by id: 2028-2029 may have been
// created before 2027-2028). The default is the first of them, i.e. the next school year.
function laterYears(years, source) {
  return source ? years.filter((y) => y.startDate > source.startDate) : [];
}

// "YYYY-MM-DD" of today on this device; only used to pick a default year when no year is current.
function todayText() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// School year select. years: [{ schoolYearId, yearName, isCurrent }]; value: { id, name } or null.
function YearSelect({ id, label, years, value, onChange, disabled, error, help, placeholder }) {
  const msgId = `${id}-msg`;
  return (
    <div className={`field promote-students-year${error ? ' invalid' : ''}`}>
      <label className="field-label" htmlFor={id}>
        <span>
          {label} <span className="transfer-student-required">*</span>
        </span>
      </label>
      <div className="input-wrap">
        <select
          id={id}
          className="input transfer-student-select"
          value={value?.id ?? ''}
          onChange={(e) => onChange(asYear(years.find((y) => String(y.schoolYearId) === e.target.value)))}
          disabled={disabled || !years.length}
          aria-invalid={Boolean(error)}
          aria-describedby={msgId}
        >
          {!value && <option value="">{placeholder}</option>}
          {years.map((y) => (
            <option key={y.schoolYearId} value={y.schoolYearId}>
              {yearLabel(y.yearName)}
              {y.isCurrent ? ' · hiện tại' : ''}
            </option>
          ))}
        </select>
        <Icon name="unfold_more" size="sm" className="transfer-student-select-icon" />
      </div>
      {error ? (
        <span id={msgId} className="field-error" role="alert">
          {error}
        </span>
      ) : (
        <span id={msgId} className="field-help">
          {help}
        </span>
      )}
    </div>
  );
}

// Business rules of a promotion (business-rules §4, §6).
function Rules() {
  return (
    <section className="card card-outline transfer-student-rules" aria-labelledby="promote-students-rules-title">
      <h2 id="promote-students-rules-title" className="transfer-student-rules-title">
        <Icon name="rule" size="sm" />
        Nguyên tắc lên lớp
      </h2>
      <ul className="caption">
        <li>Lên lớp tạo bản ghi mới ở năm học mới; bản ghi năm cũ được giữ nguyên làm lịch sử.</li>
        <li>Điểm và điểm danh của năm cũ không bị ảnh hưởng.</li>
        <li>Học sinh và phụ huynh được thêm vào nhóm của lớp mới; nhóm của năm cũ vẫn xem lại được.</li>
        <li>Có thể chọn lớp cùng khối cho học sinh ở lại lớp.</li>
      </ul>
    </section>
  );
}

function ConfirmDialog({ open, fromYear, toYear, fromClass, groups, count, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="transfer-student-dialog promote-students-dialog"
      aria-labelledby="promote-students-dialog-title"
      aria-describedby="promote-students-dialog-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="transfer-student-dialog-head">
        <Icon name="verified_user" />
        <h2 id="promote-students-dialog-title" className="title-sm">
          Xác nhận lên lớp
        </h2>
      </div>
      <div id="promote-students-dialog-desc">
        <p>
          Lên lớp cho <span className="strong mono">{count}</span> học sinh của lớp {fromClass?.className}.
        </p>
        <p className="transfer-student-dialog-move">
          <span className="chip">{yearText(fromYear)}</span>
          <Icon name="arrow_forward" size="sm" />
          <span className="chip ink">{yearText(toYear)}</span>
        </p>
        <ul className="promote-students-dialog-groups">
          {groups.map((g, i) => (
            <li key={g.key}>
              <span className="caption muted">Nhóm {i + 1}</span>
              <span>
                <span className="strong mono">{g.count}</span> học sinh
              </span>
              <Icon name="arrow_forward" size="sm" />
              <span className="chip ink">{classText(g.target)}</span>
            </li>
          ))}
        </ul>
        <div className="notice amber">
          <Icon name="warning" size="sm" />
          <p>
            Thao tác này không hoàn tác được. Mỗi học sinh có thêm một bản ghi lớp ở năm học đích; bản ghi, điểm và điểm danh
            của năm cũ được giữ nguyên.
          </p>
        </div>
      </div>
      <div className="transfer-student-dialog-actions">
        {/* The safe button gets the focus: confirming must be a deliberate click. */}
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          Quay lại
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          <Icon name={busy ? 'progress_activity' : 'upgrade'} size="sm" className={busy ? 'transfer-student-spin' : undefined} />
          {busy ? 'Đang lên lớp…' : 'Xác nhận lên lớp'}
        </button>
      </div>
    </dialog>
  );
}

// Result of one promotion request: summary, warnings and one row per student. SKIPPED is a normal outcome (amber),
// not an error.
function Result({ result, fromYear, toYear, backTo, onAgain }) {
  const [filter, setFilter] = useState('ALL');
  const { summary, results, warnings } = result;
  const shown = filter === 'SKIPPED' ? results.filter((r) => r.status === 'SKIPPED') : results;
  return (
    <section className="card card-outline promote-students-result" aria-labelledby="promote-students-result-title">
      <div className="transfer-student-result-head">
        <Icon name={summary.promoted ? 'check_circle' : 'info'} className={summary.promoted ? undefined : 'promote-students-none'} />
        <div>
          <h2 id="promote-students-result-title" className="title-sm">
            {summary.promoted ? `Đã lên lớp cho ${summary.promoted} học sinh` : 'Không có học sinh nào được lên lớp'}
          </h2>
          <p className="caption muted">
            {yearText(fromYear)} → {yearText(toYear)}
          </p>
        </div>
        {summary.promoted > 0 && <span className="stamp">Đã lưu</span>}
      </div>

      <dl className="promote-students-summary">
        <div>
          <dt className="label-upper">Tổng số</dt>
          <dd className="mono">{summary.total}</dd>
        </div>
        <div className="green">
          <dt className="label-upper">Đã lên lớp</dt>
          <dd className="mono">{summary.promoted}</dd>
        </div>
        <div className={summary.skipped ? 'amber' : undefined}>
          <dt className="label-upper">Bỏ qua</dt>
          <dd className="mono">{summary.skipped}</dd>
        </div>
      </dl>

      {warnings.length > 0 && (
        <div className="transfer-student-warnings">
          {warnings.map((w, i) => (
            <div key={`${w.code}-${w.details?.classId ?? i}`} className="notice amber" role="status">
              <Icon name="warning" size="sm" />
              <div>
                <p className="notice-title">Lên lớp đã hoàn tất, còn một việc cần lưu ý</p>
                <p>{warningText(w)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="promote-students-result-tools">
        <div className="promote-students-filter" role="group" aria-label="Lọc kết quả">
          <button type="button" className={filter === 'ALL' ? 'active' : ''} aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>
            Tất cả <span className="mono">{summary.total}</span>
          </button>
          <button
            type="button"
            className={filter === 'SKIPPED' ? 'active' : ''}
            aria-pressed={filter === 'SKIPPED'}
            onClick={() => setFilter('SKIPPED')}
          >
            Chỉ bỏ qua <span className="mono">{summary.skipped}</span>
          </button>
        </div>
      </div>

      <div className="promote-students-scroll">
        <table className="table">
          <thead>
            <tr>
              <th className="num">Mã HS</th>
              <th className="sticky">Họ và tên</th>
              <th>Lớp cũ → lớp mới</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="promote-students-empty">
                  Không có học sinh nào bị bỏ qua.
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.studentId} className={r.status === 'SKIPPED' ? 'is-skipped' : undefined}>
                <td className="num mono caption">{r.studentCode ?? '—'}</td>
                <td className="sticky">
                  <span className="strong">{r.fullName ?? `Mã học sinh ${r.studentId}`}</span>
                </td>
                <td>
                  {r.status === 'PROMOTED' ? (
                    <span className="promote-students-move">
                      <span className="chip">{r.fromClassName}</span>
                      <Icon name="arrow_forward" size="sm" />
                      <span className="chip ink">{r.toClassName}</span>
                    </span>
                  ) : (
                    <span className="caption muted">Không thay đổi</span>
                  )}
                </td>
                <td>
                  {r.status === 'PROMOTED' ? (
                    <span className="pill green">Đã lên lớp</span>
                  ) : (
                    <div className="promote-students-outcome">
                      <span className="pill amber">Bỏ qua</span>
                      <span className="caption">{skipText(r)}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="transfer-student-footer">
        <span className="caption muted">Quá trình học của các học sinh đã được cập nhật.</span>
        <div className="transfer-student-buttons">
          <Link to={backTo} className="btn btn-secondary">
            Về danh sách học sinh
          </Link>
          <button type="button" className="btn btn-primary" onClick={onAgain}>
            <Icon name="upgrade" size="sm" />
            Lên lớp cho lớp khác
          </button>
        </div>
      </div>
    </section>
  );
}

let nextGroupKey = 1;
const newGroup = () => ({ key: nextGroupKey++, target: null });

// SCR-11 Student Transfer & Promotion – the promotion tab (UC-11 Promote Students), School Manager only.
// A batch action, not tied to one student: opened at /students/promote (Student List button, or the tab of the
// transfer page). Steps: 1. source year, source class and destination year; 2. students (STUDYING ones of the
// class); 3. one or more groups, each with a destination class (split a class, or keep some students in the same
// grade); 4. confirmation. The grade level is not checked (UC-11): School Manager picks every class.
// Design: Stitch "SCR-10 Student Transfer & Promotion", promotion tab. Its school-wide grade table (with academic
// review and graduation) has no API behind it; this keeps its look (banner, stamp, table card) for one class at a time.
export default function PromoteStudentsPanel({ tabs }) {
  const location = useLocation();
  const toast = useToast();
  const { user, activeRole } = useAuth();
  const handoff = location.state ?? {};
  const backTo = `/students${handoff.listSearch ?? ''}`;

  // Step 1 – scope. Years and classes come from GET /students/promote/options (temporary, TODO FE-04).
  const [years, setYears] = useState(null); // schoolYears of the options endpoint, by start_date
  const [yearsError, setYearsError] = useState('');
  const [yearsAttempt, setYearsAttempt] = useState(0);
  const [fromYear, setFromYear] = useState(null); // { id, name, startDate }
  const [fromClass, setFromClass] = useState(handoff.fromClass ?? null); // { classId, className }
  const [toYear, setToYear] = useState(null);
  const [sourceClasses, setSourceClasses] = useState(null); // classes of fromYear (options shape)
  const [targetClasses, setTargetClasses] = useState(null); // classes of toYear
  const [classesError, setClassesError] = useState('');
  // Step 2 – roster of the source class and who is already in the destination year.
  const [roster, setRoster] = useState(null);
  const [rosterError, setRosterError] = useState('');
  const [rosterAttempt, setRosterAttempt] = useState(0);
  const [enrolledInTarget, setEnrolledInTarget] = useState(null); // Map studentId -> className
  const [selected, setSelected] = useState(() => new Set());
  // Step 3 – groups and who goes in which.
  const [groups, setGroups] = useState(() => [newGroup()]);
  const [groupOf, setGroupOf] = useState(() => new Map());
  // Errors, confirmation, result.
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // a second click before React re-renders must not send a second promotion
  const [result, setResult] = useState(null);
  const [round, setRound] = useState(0); // "promote another class" remounts the class fields

  // School years, then the defaults: source = the current year (or the student's year when opened from the transfer
  // tab), destination = the next year after it.
  useEffect(() => {
    const controller = new AbortController();
    setYearsError('');
    getPromoteOptions({}, { signal: controller.signal })
      .then(({ schoolYears }) => {
        setYears(schoolYears);
        const handed = schoolYears.find((y) => y.schoolYearId === handoff.fromSchoolYear?.id);
        const source = handed ?? defaultSourceYear(schoolYears, todayText());
        setFromYear(asYear(source));
        setToYear(asYear(laterYears(schoolYears, source)[0]));
      })
      .catch((err) => {
        if (!controller.signal.aborted) setYearsError(err.code === 'NETWORK_ERROR' ? errorText(err) : YEARS_ERROR);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsAttempt]);

  // Classes of the source year and of the destination year (with their current size). Reloaded after a promotion
  // ("round") so the sizes are up to date.
  useEffect(() => {
    setSourceClasses(null);
    setClassesError('');
    if (!fromYear) return undefined;
    const controller = new AbortController();
    getPromoteOptions({ toSchoolYearId: fromYear.id }, { signal: controller.signal })
      .then(({ classes }) => setSourceClasses(classes))
      .catch(() => {
        if (!controller.signal.aborted) setClassesError(CLASSES_ERROR);
      });
    return () => controller.abort();
  }, [fromYear?.id, round, yearsAttempt]);

  useEffect(() => {
    setTargetClasses(null);
    setClassesError('');
    if (!toYear) return undefined;
    const controller = new AbortController();
    getPromoteOptions({ toSchoolYearId: toYear.id }, { signal: controller.signal })
      .then(({ classes }) => setTargetClasses(classes))
      .catch(() => {
        if (!controller.signal.aborted) setClassesError(CLASSES_ERROR);
      });
    return () => controller.abort();
  }, [toYear?.id, round, yearsAttempt]);

  // Students of the source class in the source year: one row per student (UC-07 without status = their current
  // enrollment of the year), so a student who transferred out is listed under their new class, not here.
  useEffect(() => {
    setRoster(null);
    setRosterError('');
    if (!fromYear || !fromClass) return undefined;
    const controller = new AbortController();
    listAllStudents({ schoolYearId: fromYear.id, classId: fromClass.classId }, { signal: controller.signal })
      .then((items) => {
        setRoster(items);
        // ASSUMPTION: every student still studying in the class is ticked by default (promoting a whole class is
        // the usual case); students who left cannot be ticked.
        const eligible = items.filter((s) => s.enrollmentStatus === 'STUDYING').map((s) => s.studentId);
        setSelected(new Set(eligible));
        setGroupOf(new Map()); // everyone starts in the first group (groupKeyOf)
      })
      .catch((err) => {
        if (!controller.signal.aborted) setRosterError(err.code === 'NETWORK_ERROR' ? errorText(err) : ROSTER_ERROR);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromYear?.id, fromClass?.classId, rosterAttempt]);

  // Students who already have a class in the destination year: the server would skip them
  // (SKIP_ALREADY_ENROLLED), so they are marked and not ticked by default – School Manager can still tick them.
  useEffect(() => {
    setEnrolledInTarget(null);
    if (!toYear) return undefined;
    const controller = new AbortController();
    listAllStudents({ schoolYearId: toYear.id }, { signal: controller.signal })
      .then((items) => setEnrolledInTarget(new Map(items.map((s) => [s.studentId, s.className]))))
      .catch(() => {}); // only a hint; the server decides
    return () => controller.abort();
  }, [toYear?.id, rosterAttempt]);

  useEffect(() => {
    if (!enrolledInTarget || !roster) return;
    setSelected((prev) => new Set([...prev].filter((studentId) => !enrolledInTarget.has(studentId))));
  }, [enrolledInTarget, roster]);

  const sameYear = fromYear && toYear && fromYear.id === toYear.id;
  const selectable = (roster ?? []).filter((s) => s.enrollmentStatus === 'STUDYING');
  const chosen = (roster ?? []).filter((s) => selected.has(s.studentId));
  // A student without a group of their own (or whose group was removed) is in the first group.
  const groupKeyOf = (studentId) => {
    const key = groupOf.get(studentId);
    return groups.some((g) => g.key === key) ? key : groups[0].key;
  };
  const countOf = (key) => chosen.filter((s) => groupKeyOf(s.studentId) === key).length;
  const tickable = selectable.filter((s) => !enrolledInTarget?.has(s.studentId));
  const allTicked = tickable.length > 0 && tickable.every((s) => selected.has(s.studentId));

  function clearErrors(...keys) {
    setErrors((e) => {
      const next = { ...e };
      for (const key of keys) delete next[key];
      return next;
    });
    setFormError('');
  }

  // A new source year also gets its own default destination: the next year after it.
  function changeFromYear(year) {
    setFromYear(year);
    setFromClass(null);
    changeToYear(asYear(laterYears(years, year)[0]));
    clearErrors('fromYear', 'fromClass', 'toYear');
  }

  function changeToYear(year) {
    setToYear(year);
    setGroups((gs) => gs.map((g) => ({ ...g, target: null }))); // classes belong to one year
    clearErrors('toYear', 'groups');
  }

  function toggle(studentId, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
    clearErrors('students');
  }

  function toggleAll(on) {
    setSelected(on ? new Set(tickable.map((s) => s.studentId)) : new Set());
    clearErrors('students');
  }

  function setTarget(key, target) {
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, target } : g)));
    clearErrors('groups');
  }

  function addGroup() {
    setGroups((gs) => [...gs, newGroup()]);
    clearErrors('groups');
  }

  // The students of a removed group go back to the first group.
  function removeGroup(key) {
    const rest = groups.filter((g) => g.key !== key);
    setGroups(rest);
    setGroupOf((m) => new Map([...m].map(([studentId, k]) => [studentId, k === key ? rest[0].key : k])));
    clearErrors('groups');
  }

  function askConfirm(e) {
    e.preventDefault();
    if (busy) return;
    const next = {};
    if (!fromYear) next.fromYear = 'Vui lòng chọn năm học nguồn.';
    if (!toYear) next.toYear = 'Vui lòng nhập năm học đích.';
    else if (sameYear) next.toYear = PROMOTE_ERRORS.MSG_SAME_SCHOOL_YEAR;
    if (fromYear && !fromClass) next.fromClass = 'Vui lòng chọn lớp nguồn.';
    if (fromClass && roster && chosen.length === 0) next.students = 'Vui lòng chọn ít nhất một học sinh.';
    if (chosen.length > MAX_STUDENTS) next.students = PROMOTE_ERRORS.MSG_TOO_MANY_STUDENTS;
    const groupErrors = {};
    groups.forEach((g) => {
      if (!g.target) groupErrors[g.key] = 'Vui lòng chọn lớp đích.';
      else if (countOf(g.key) === 0) groupErrors[g.key] = 'Nhóm chưa có học sinh. Chọn nhóm này cho một số học sinh hoặc xoá nhóm.';
    });
    if (toYear && Object.keys(groupErrors).length) next.groups = groupErrors;
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length || !roster) {
      document.querySelector('.promote-students [aria-invalid="true"], .promote-students .field-error')?.closest('.field, .promote-students-step')?.scrollIntoView({ block: 'center' });
      return;
    }
    setConfirming(true);
  }

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const body = {
      fromSchoolYearId: fromYear.id,
      toSchoolYearId: toYear.id,
      groups: groups.map((g) => ({
        toClassId: g.target.classId,
        studentIds: chosen.filter((s) => groupKeyOf(s.studentId) === g.key).map((s) => s.studentId),
      })),
    };
    try {
      const res = await promoteStudents(body);
      setResult(res);
      setConfirming(false);
      toast(res.summary.promoted ? `Đã lên lớp cho ${res.summary.promoted} học sinh.` : 'Không có học sinh nào được lên lớp.');
      window.scrollTo({ top: 0 });
    } catch (err) {
      setConfirming(false);
      const text = promoteErrorText(err);
      if (err.code === 'MSG_SAME_SCHOOL_YEAR' || err.code === 'MSG_INVALID_YEAR_ORDER') {
        setErrors({ toYear: text });
      } else if (err.code === 'MSG_CLASS_NOT_FOUND' && err.details?.classIds) {
        const missing = new Set(err.details.classIds);
        const groupErrors = {};
        for (const g of groups) if (missing.has(g.target.classId)) groupErrors[g.key] = 'Không tìm thấy lớp này trong năm học đích.';
        setErrors({ groups: groupErrors });
      } else {
        setFormError(text);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Back to step 1 with the same years, for the next class.
  function again() {
    setResult(null);
    setFromClass(null);
    setGroups([newGroup()]);
    setGroupOf(new Map());
    setSelected(new Set());
    setErrors({});
    setRound((n) => n + 1);
    setRosterAttempt((n) => n + 1); // refresh who is in the destination year
    window.scrollTo({ top: 0 });
  }

  const ready = fromYear && fromClass && toYear && !sameYear;
  const currentYear = years?.find((y) => y.isCurrent);
  const destinationYears = laterYears(years ?? [], fromYear);

  return (
    <div className="transfer-student promote-students">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>/<span className="current">Lên lớp</span>
      </nav>
      <div className="page-header">
        <div>
          <span className="label-upper transfer-student-eyebrow">Hồ sơ học sinh</span>
          <h1 className="headline-xl">Chuyển lớp &amp; Lên lớp</h1>
          <p>Chuyển học sinh giữa các lớp trong năm học và lên lớp sang năm học mới.</p>
        </div>
        {currentYear && (
          <div className="transfer-student-metric">
            <span className="label-upper">Năm học hiện tại</span>
            <span className="title-sm mono">{yearLabel(currentYear.yearName)}</span>
          </div>
        )}
      </div>

      {tabs}

      <div className="transfer-student-grid" role="tabpanel" aria-labelledby="transfer-student-tab-promote">
        <div className="promote-students-main">
          {/* Design banner: notebook margin rule and the ink stamp of the destination year. */}
          <div className="card card-outline promote-students-banner">
            <div>
              <span className="label-upper promote-students-banner-eyebrow">
                <Icon name="fact_check" size="sm" />
                Lên lớp năm học mới
              </span>
              <h2 className="title-md">
                {fromYear ? yearText(fromYear) : 'Năm học nguồn'} → {toYear ? yearText(toYear).toLowerCase() : 'năm học đích'}
              </h2>
              <p className="caption muted">
                Xếp học sinh của một lớp vào lớp của năm học mới. Mỗi lần làm một lớp; một lớp có thể chia thành nhiều lớp mới.
              </p>
            </div>
            {toYear && (
              <span className="stamp">
                <Icon name="verified" size="sm" />
                {`Niên khoá ${yearLabel(toYear.name)}`}
              </span>
            )}
          </div>

          {result ? (
            <Result result={result} fromYear={fromYear} toYear={toYear} backTo={backTo} onAgain={again} />
          ) : (
            <form className="card card-outline transfer-student-form promote-students-form" onSubmit={askConfirm} noValidate>
              <fieldset disabled={busy} className="promote-students-fieldset">
                {/* Step 1 */}
                <section className="promote-students-step" aria-labelledby="promote-students-step1">
                  <h2 id="promote-students-step1" className="promote-students-step-title">
                    <span className="promote-students-step-no">1</span>
                    Chọn phạm vi
                  </h2>
                  {yearsError || classesError ? (
                    <div className="form-error" role="alert">
                      <Icon name="error" size="sm" />
                      <p>{yearsError || classesError}</p>
                      <button type="button" className="link-button" onClick={() => setYearsAttempt((n) => n + 1)}>
                        Thử lại
                      </button>
                    </div>
                  ) : null}
                  {years && years.length === 0 && (
                    <div className="notice amber" role="status">
                      <Icon name="info" size="sm" />
                      <p>Chưa có năm học nào. Cần tạo năm học trước khi lên lớp.</p>
                    </div>
                  )}
                  <div className="promote-students-scope">
                    <YearSelect
                      id="promote-students-from-year"
                      label="Năm học nguồn"
                      years={years ?? []}
                      value={fromYear}
                      onChange={changeFromYear}
                      disabled={busy || !years}
                      error={errors.fromYear}
                      placeholder={years ? 'Chọn năm học' : 'Đang tải năm học…'}
                      help="Mặc định là năm học hiện tại."
                    />
                    <TargetClassPicker
                      key={`from-${fromYear?.id ?? '-'}`}
                      id="promote-students-from-class"
                      options={fromYear ? sourceClasses : []}
                      value={fromClass}
                      onChange={(value) => {
                        setFromClass(value);
                        clearErrors('fromClass', 'students');
                      }}
                      disabled={busy || !fromYear}
                      error={errors.fromClass}
                      label="Lớp nguồn"
                      help="Lớp của năm học nguồn, kèm sĩ số hiện tại."
                    />
                    <YearSelect
                      id="promote-students-to-year"
                      label="Năm học đích"
                      years={destinationYears}
                      value={toYear}
                      onChange={changeToYear}
                      disabled={busy || !years}
                      error={errors.toYear || (sameYear ? PROMOTE_ERRORS.MSG_SAME_SCHOOL_YEAR : '')}
                      placeholder={years ? 'Chưa có năm học' : 'Đang tải năm học…'}
                      help="Mặc định là năm học kế tiếp."
                    />
                  </div>
                  {years && fromYear && destinationYears.length === 0 && (
                    <div className="notice amber" role="status">
                      <Icon name="info" size="sm" />
                      <div>
                        <p className="notice-title">Chưa có năm học tiếp theo</p>
                        <p>
                          Cần tạo năm học mới trước khi lên lớp. Năm học do bộ phận quản lý lớp học tạo (chức năng tạo năm
                          học).
                        </p>
                      </div>
                    </div>
                  )}
                </section>

                {/* Step 2 */}
                <section className="promote-students-step" aria-labelledby="promote-students-step2">
                  <div className="promote-students-step-head">
                    <h2 id="promote-students-step2" className="promote-students-step-title">
                      <span className="promote-students-step-no">2</span>
                      Chọn học sinh
                    </h2>
                    {roster && (
                      <span className="promote-students-count" aria-live="polite">
                        Đã chọn <span className="mono strong">{chosen.length}</span> / {selectable.length} học sinh
                      </span>
                    )}
                  </div>
                  {!fromClass ? (
                    <p className="caption muted">Chọn lớp nguồn để xem danh sách học sinh.</p>
                  ) : rosterError ? (
                    <div className="form-error" role="alert">
                      <Icon name="error" size="sm" />
                      <p>{rosterError}</p>
                      <button type="button" className="link-button" onClick={() => setRosterAttempt((n) => n + 1)}>
                        Thử lại
                      </button>
                    </div>
                  ) : !roster ? (
                    <p className="caption muted" aria-busy="true">
                      Đang tải danh sách học sinh…
                    </p>
                  ) : roster.length === 0 ? (
                    <p className="caption muted">Lớp này chưa có học sinh nào trong năm học nguồn.</p>
                  ) : (
                    <>
                      <div className="promote-students-tools">
                        <button type="button" className="btn btn-secondary" onClick={() => toggleAll(true)} disabled={allTicked}>
                          <Icon name="done_all" size="sm" />
                          Chọn tất cả
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => toggleAll(false)} disabled={selected.size === 0}>
                          <Icon name="remove_done" size="sm" />
                          Bỏ chọn tất cả
                        </button>
                      </div>
                      {errors.students && (
                        <span className="field-error" role="alert">
                          {errors.students}
                        </span>
                      )}
                      <div className="promote-students-scroll">
                        <table className="table">
                          <thead>
                            <tr>
                              <th className="check">
                                <span className="visually-hidden">Chọn</span>
                              </th>
                              <th className="num">Mã HS</th>
                              <th className="sticky">Họ và tên</th>
                              <th>Tình trạng</th>
                              <th>{groups.length > 1 ? 'Nhóm · lớp đích' : 'Lớp đích'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {roster.map((s) => {
                              const studying = s.enrollmentStatus === 'STUDYING';
                              const elsewhere = enrolledInTarget?.get(s.studentId);
                              const ticked = selected.has(s.studentId);
                              const key = groupKeyOf(s.studentId);
                              const index = groups.findIndex((g) => g.key === key);
                              const checkId = `promote-students-check-${s.studentId}`;
                              return (
                                <tr key={s.studentId} className={!studying ? 'is-locked' : ticked ? 'is-ticked' : undefined}>
                                  <td className="check">
                                    <label htmlFor={checkId} className="promote-students-check">
                                      <input
                                        id={checkId}
                                        type="checkbox"
                                        checked={ticked}
                                        disabled={!studying}
                                        onChange={(e) => toggle(s.studentId, e.target.checked)}
                                        aria-label={`Chọn ${s.fullName}`}
                                      />
                                    </label>
                                  </td>
                                  <td className="num mono caption">{s.studentCode}</td>
                                  <td className="sticky">
                                    <div className="promote-students-name">
                                      <Avatar src={s.avatarUrl} name={s.fullName} size={24} square />
                                      <span>{s.fullName}</span>
                                    </div>
                                  </td>
                                  <td>
                                    {!studying ? (
                                      <span className="promote-students-status">
                                        <span className="pill">{ENROLLMENT_LABELS[s.enrollmentStatus] ?? s.enrollmentStatus}</span>
                                        <span className="caption muted">Không lên lớp được</span>
                                      </span>
                                    ) : elsewhere ? (
                                      <span className="promote-students-status">
                                        <span className="pill amber">Đã có lớp {elsewhere}</span>
                                        <span className="caption muted">ở năm học đích, sẽ được bỏ qua</span>
                                      </span>
                                    ) : (
                                      <span className="pill green">Đang học</span>
                                    )}
                                  </td>
                                  <td>
                                    {!ticked ? (
                                      <span className="caption muted">—</span>
                                    ) : groups.length > 1 ? (
                                      <select
                                        className="input promote-students-group-select"
                                        value={key}
                                        onChange={(e) => setGroupOf((m) => new Map(m).set(s.studentId, Number(e.target.value)))}
                                        aria-label={`Nhóm của ${s.fullName}`}
                                      >
                                        {groups.map((g, i) => (
                                          <option key={g.key} value={g.key}>
                                            Nhóm {i + 1}
                                            {g.target ? ` · ${classText(g.target)}` : ''}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="caption promote-students-target">{classText(groups[index]?.target) || 'Chưa chọn lớp'}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="caption muted">
                        Học sinh đã nghỉ học hoặc đã chuyển khỏi lớp không lên lớp được. Học sinh đã chuyển sang lớp khác trong
                        năm được lên lớp từ lớp đang học.
                      </p>
                    </>
                  )}
                </section>

                {/* Step 3 */}
                <section className="promote-students-step" aria-labelledby="promote-students-step3">
                  <div className="promote-students-step-head">
                    <h2 id="promote-students-step3" className="promote-students-step-title">
                      <span className="promote-students-step-no">3</span>
                      Gán lớp đích
                    </h2>
                  </div>
                  <p className="caption muted">
                    Mỗi nhóm vào một lớp của năm học đích. Để tách lớp, thêm nhóm rồi chọn nhóm cho từng học sinh ở bảng trên.
                    Hệ thống không kiểm tra khối: học sinh ở lại lớp có thể vào một lớp cùng khối.
                  </p>
                  {!toYear ? (
                    // No later year at all: step 1 already says so.
                    destinationYears.length > 0 && (
                      <div className="notice">
                        <Icon name="info" size="sm" />
                        <p>Chọn năm học đích ở bước 1 để chọn lớp đích.</p>
                      </div>
                    )
                  ) : targetClasses && targetClasses.length === 0 ? (
                    <div className="notice amber" role="status">
                      <Icon name="info" size="sm" />
                      <div>
                        <p className="notice-title">Năm học {yearLabel(toYear.name)} chưa có lớp nào</p>
                        <p>Cần bộ phận quản lý lớp học tạo lớp cho năm học này trước (tạo lớp hoặc nhập lớp), rồi quay lại lên lớp.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="promote-students-groups">
                      {groups.map((g, i) => (
                        <div key={g.key} className="promote-students-group">
                          <div className="promote-students-group-head">
                            <span className="strong">Nhóm {i + 1}</span>
                            <span className="chip mono">{countOf(g.key)} học sinh</span>
                            {groups.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-tertiary promote-students-remove"
                                onClick={() => removeGroup(g.key)}
                                aria-label={`Xoá nhóm ${i + 1}`}
                              >
                                <Icon name="close" size="sm" />
                                Xoá nhóm
                              </button>
                            )}
                          </div>
                          <TargetClassPicker
                            key={`${g.key}-${toYear.id}`}
                            id={`promote-students-group-${g.key}`}
                            options={targetClasses}
                            value={g.target}
                            onChange={(value) => setTarget(g.key, value)}
                            disabled={busy || sameYear}
                            error={errors.groups?.[g.key]}
                            label="Lớp đích"
                            help={`Lớp của năm học ${yearLabel(toYear.name)}, kèm khối và sĩ số hiện tại.`}
                          />
                        </div>
                      ))}
                      <button type="button" className="btn btn-secondary promote-students-add" onClick={addGroup}>
                        <Icon name="add" size="sm" />
                        Thêm nhóm
                      </button>
                    </div>
                  )}
                </section>

                {formError && (
                  <div className="form-error" role="alert">
                    <Icon name="error" size="sm" />
                    <p>{formError}</p>
                  </div>
                )}

                <div className="transfer-student-footer">
                  <span className="caption muted">
                    Người thực hiện: {user?.fullName} ({ROLE_LABELS[activeRole] ?? activeRole})
                  </span>
                  <div className="transfer-student-buttons">
                    <Link to={backTo} className="btn btn-secondary">
                      Huỷ
                    </Link>
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      <Icon name="upgrade" size="sm" />
                      Lên lớp
                    </button>
                  </div>
                </div>
              </fieldset>
            </form>
          )}
        </div>

        <aside className="transfer-student-aside">
          <Rules />
        </aside>
      </div>

      {ready && (
        <ConfirmDialog
          open={confirming}
          fromYear={fromYear}
          toYear={toYear}
          fromClass={fromClass}
          groups={groups.map((g) => ({ ...g, count: countOf(g.key) }))}
          count={chosen.length}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
