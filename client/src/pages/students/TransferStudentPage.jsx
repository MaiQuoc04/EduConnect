import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getStudent, transferStudent } from '../../api/students.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import PromoteStudentsPanel from './PromoteStudentsPanel.jsx';
import TargetClassPicker from './TargetClassPicker.jsx';
import './TransferStudentPage.css';

const LOAD_ERROR = 'Không tải được thông tin học sinh. Vui lòng thử lại.';
const TRANSFER_ERROR = 'Không chuyển được lớp cho học sinh. Vui lòng thử lại.';

// TODO messages.js: these codes are waiting for the team lead's approval (with the other FE-02 codes). Until then
// the Vietnamese text lives here; errorText() wins as soon as messages.js has the code.
const TRANSFER_ERRORS = {
  MSG_TRANSFER_SAME_CLASS: 'Học sinh đang học ở lớp này. Vui lòng chọn lớp khác.',
  MSG_TRANSFER_DIFFERENT_YEAR: 'Lớp đích thuộc năm học khác. Vui lòng dùng chức năng lên lớp.',
  MSG_CLASS_ALREADY_ENROLLED: 'Học sinh đã từng học ở lớp này, không thể chuyển về lại.',
  MSG_NO_ACTIVE_ENROLLMENT: 'Học sinh hiện không học ở lớp nào trong năm học này.',
  MSG_CLASS_NOT_FOUND: 'Không tìm thấy lớp học.',
  MSG_STUDENT_NOT_FOUND: 'Không tìm thấy học sinh.',
  MSG_INVALID_PARAM: 'Mã lớp không hợp lệ.',
  MSG_TRANSFER_DIFFERENT_GRADE_LEVEL: ({ currentGradeLevel, targetGradeLevel } = {}) =>
    currentGradeLevel && targetGradeLevel
      ? `Chỉ chuyển lớp trong cùng khối. Lớp đích thuộc khối ${targetGradeLevel}, học sinh đang học khối ${currentGradeLevel}; vui lòng dùng chức năng lên lớp.`
      : 'Chỉ chuyển lớp trong cùng khối. Lớp đích thuộc khối khác, vui lòng dùng chức năng lên lớp.',
};
// Errors about the chosen class are shown under the class field; the rest above the buttons.
const CLASS_ERRORS = ['MSG_TRANSFER_SAME_CLASS', 'MSG_TRANSFER_DIFFERENT_YEAR', 'MSG_TRANSFER_DIFFERENT_GRADE_LEVEL',
  'MSG_CLASS_ALREADY_ENROLLED', 'MSG_CLASS_NOT_FOUND', 'MSG_INVALID_PARAM'];

const GROUP_LABELS = { GENERAL: 'Nhóm chung', STUDENT: 'Nhóm học sinh', PARENT: 'Nhóm phụ huynh', TEAM_CHAT: 'Nhóm nhỏ' };

// TODO messages.js: WARN_* codes are waiting for approval too. warnings[].message is English (CLAUDE.md), so it is
// never shown; an unknown code gets a general sentence and a console warning.
const WARNING_TEXTS = {
  WARN_CLASS_HAS_NO_GROUPS: () => 'Lớp đích chưa có nhóm lớp, học sinh chưa được thêm vào nhóm nào.',
  WARN_CLASS_GROUPS_MISSING: (details) => {
    const missing = (details?.missingGroupTypes ?? []).map((t) => GROUP_LABELS[t] ?? t).join(', ');
    return `Lớp đích còn thiếu ${missing ? missing.toLowerCase() : 'một số nhóm lớp'}, học sinh và phụ huynh chưa được thêm vào các nhóm đó.`;
  },
};
const WARNING_FALLBACK = 'Chuyển lớp đã hoàn tất nhưng còn một việc chưa thực hiện được. Vui lòng kiểm tra lại nhóm lớp.';

const yearLabel = (name) => String(name ?? '').replace('-', ' – ');

// "2026-10-27 15:58:14.93+07" (Vietnam time from the API) -> "15:58, 27/10/2026"
function formatDateTime(value) {
  if (!value) return '';
  return `${String(value).slice(11, 16)}, ${formatDate(value)}`;
}

function transferErrorText(err) {
  const general = errorText({ code: 'SERVER_ERROR' });
  const known = errorText({ code: err.code, details: err.details });
  if (known !== general || err.code === 'SERVER_ERROR') return known;
  const local = TRANSFER_ERRORS[err.code];
  if (local) return typeof local === 'function' ? local(err.details) : local;
  console.warn(`[TransferStudent] No Vietnamese message for error code ${err.code}:`, err.message);
  return TRANSFER_ERROR;
}

function warningText({ code, details, message }) {
  const known = errorText({ code, details });
  if (known !== errorText({ code: 'SERVER_ERROR' }) && known !== message) return known;
  if (WARNING_TEXTS[code]) return WARNING_TEXTS[code](details);
  console.warn(`[TransferStudent] No Vietnamese message for warning code ${code}:`, message);
  return WARNING_FALLBACK;
}

function Breadcrumb({ backTo, detailPath, studentCode }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
      {studentCode && (
        <>
          /
          <Link to={detailPath} className="mono">
            {studentCode}
          </Link>
        </>
      )}
      /<span className="current">Chuyển lớp</span>
    </nav>
  );
}

function Skeleton({ backTo, detailPath }) {
  return (
    <div className="transfer-student" aria-busy="true">
      <Breadcrumb backTo={backTo} detailPath={detailPath} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chuyển lớp &amp; Lên lớp</h1>
          <p>Đang tải thông tin học sinh…</p>
        </div>
      </div>
      <div className="card card-outline transfer-student-skeleton" aria-hidden="true">
        <span className="block" />
        <span className="block" />
        <span className="block short" />
      </div>
    </div>
  );
}

function NotFound({ backTo }) {
  return (
    <div className="transfer-student">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
      </nav>
      <section className="card card-outline transfer-student-missing">
        <Icon name="person_search" />
        <h1 className="title-md">Không tìm thấy học sinh</h1>
        <p className="muted">Học sinh này không tồn tại hoặc đường dẫn không đúng.</p>
        <Link to={backTo} className="btn btn-primary">
          <Icon name="arrow_back" size="sm" />
          Quay lại danh sách
        </Link>
      </section>
    </div>
  );
}

// Tabs of the design. The two tabs are two routes: a transfer (UC-10) is for one student
// (/students/:studentId/transfer), a promotion (UC-11) for many (/students/promote). onSelect(tab) is given for the
// tab that can be opened from here; without it the other tab is shown disabled with transferNote (the promotion
// page opened from Student List has no student to transfer).
function Tabs({ active, onSelect, transferNote }) {
  const tab = (name, icon, label, chip) => {
    const isActive = active === name;
    const blocked = !isActive && !onSelect;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        className={isActive ? 'active' : undefined}
        id={`transfer-student-tab-${name}`}
        disabled={blocked}
        title={blocked ? transferNote : undefined}
        aria-describedby={blocked ? 'transfer-student-tab-soon' : undefined}
        onClick={isActive ? undefined : () => onSelect(name)}
      >
        <Icon name={icon} size="sm" />
        <span>{label}</span>
        <span className={`chip mono${isActive ? ' ink' : ''}`}>{chip}</span>
      </button>
    );
  };
  return (
    <div className="transfer-student-tabs" role="tablist" aria-label="Chuyển lớp và lên lớp">
      {tab('transfer', 'sync_alt', 'Chuyển lớp', 'Trong kỳ')}
      {tab('promote', 'upgrade', 'Lên lớp năm học mới', 'Niên khoá mới')}
      {!onSelect && transferNote && (
        <span id="transfer-student-tab-soon" className="caption muted transfer-student-tab-soon">
          {transferNote}
        </span>
      )}
    </div>
  );
}

// Read-only snapshot of the class the student is studying in now.
function CurrentClass({ current }) {
  return (
    <div className="transfer-student-current">
      <span className="field-label">Lớp hiện tại</span>
      <div className="transfer-student-current-box">
        <span className="transfer-student-badge">{current.className}</span>
        <div>
          <div className="transfer-student-current-head">
            <span className="strong">Lớp {current.className}</span>
            <span className="chip">
              Khối {current.gradeLevelName} · {current.trackName}
            </span>
          </div>
          <p className="caption muted">
            GVCN: {current.homeroomTeacherName ?? 'Chưa phân công'} · Năm học {yearLabel(current.schoolYearName)}
          </p>
          <p className="caption muted">
            Vào lớp: <span className="mono">{formatDate(current.enrolledAt)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// The student's class history (UC-08), newest first – stands in for the design's transfer log, which would need a
// school-wide log API that does not exist.
function HistoryLog({ history }) {
  const LABELS = { STUDYING: 'Đang học', TRANSFERRED: 'Đã chuyển lớp', DROPPED: 'Đã nghỉ học' };
  return (
    <section className="card card-outline transfer-student-log" aria-labelledby="transfer-student-log-title">
      <div className="transfer-student-aside-head">
        <h2 id="transfer-student-log-title" className="label-upper">
          Quá trình học
        </h2>
        <span className="caption muted">{history.length} bản ghi</span>
      </div>
      {history.length === 0 ? (
        <p className="caption muted">Chưa có bản ghi nào.</p>
      ) : (
        <ol>
          {history.map((e) => (
            <li key={e.enrollmentId}>
              <div className="transfer-student-log-head">
                <span className="strong">Lớp {e.className}</span>
                <span className="caption muted mono">{yearLabel(e.schoolYearName)}</span>
              </div>
              <p className="caption mono">
                {formatDate(e.enrolledAt)}
                {e.leftAt ? ` – ${formatDate(e.leftAt)}` : ''}
              </p>
              <span className={`pill${e.status === 'STUDYING' ? ' green' : ''}`}>{LABELS[e.status] ?? e.status}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Business rules of a transfer (business-rules §4, §6 and the UNIQUE (student_id, class_id) of class_enrollments).
function Rules() {
  return (
    <section className="card card-outline transfer-student-rules" aria-labelledby="transfer-student-rules-title">
      <h2 id="transfer-student-rules-title" className="transfer-student-rules-title">
        <Icon name="rule" size="sm" />
        Nguyên tắc chuyển lớp
      </h2>
      <ul className="caption">
        <li>Chỉ chuyển giữa các lớp cùng khối trong cùng năm học. Lên khối trên hoặc sang năm học mới thì dùng chức năng lên lớp.</li>
        <li>Không thể chuyển học sinh về lại một lớp đã từng học.</li>
        <li>Điểm và điểm danh ở lớp cũ được giữ nguyên; lớp cũ ghi nhận học sinh đã chuyển đi.</li>
        <li>Học sinh và phụ huynh rời nhóm của lớp cũ và được thêm vào nhóm của lớp mới.</li>
      </ul>
    </section>
  );
}

function ConfirmDialog({ open, student, fromClassName, toName, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="transfer-student-dialog"
      aria-labelledby="transfer-student-dialog-title"
      aria-describedby="transfer-student-dialog-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="transfer-student-dialog-head">
        <Icon name="verified_user" />
        <h2 id="transfer-student-dialog-title" className="title-sm">
          Xác nhận chuyển lớp
        </h2>
      </div>
      <div id="transfer-student-dialog-desc">
        <p>
          Chuyển học sinh <span className="strong">{student.fullName}</span> (<span className="mono">{student.studentCode}</span>)
        </p>
        <p className="transfer-student-dialog-move">
          <span className="chip">Lớp {fromClassName}</span>
          <Icon name="arrow_forward" size="sm" />
          <span className="chip ink">{toName}</span>
        </p>
        <div className="notice amber">
          <Icon name="warning" size="sm" />
          <p>
            Sau khi chuyển, không thể chuyển học sinh này quay lại lớp {fromClassName}. Điểm và điểm danh ở lớp cũ vẫn được
            giữ nguyên.
          </p>
        </div>
      </div>
      <div className="transfer-student-dialog-actions">
        {/* The safe button gets the focus: confirming must be a deliberate click. */}
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          Quay lại
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          <Icon name={busy ? 'progress_activity' : 'move_up'} size="sm" className={busy ? 'transfer-student-spin' : undefined} />
          {busy ? 'Đang chuyển lớp…' : 'Xác nhận chuyển lớp'}
        </button>
      </div>
    </dialog>
  );
}

// Who left / joined which group, from groupChanges. Names: the student, or a linked parent (UC-08 parents).
function GroupList({ title, icon, items, nameOf }) {
  const byGroup = new Map();
  for (const item of items) {
    if (!byGroup.has(item.groupId)) byGroup.set(item.groupId, { ...item, names: [] });
    byGroup.get(item.groupId).names.push(nameOf(item));
  }
  return (
    <div className="transfer-student-groups">
      <h3 className="label-upper">
        <Icon name={icon} size="sm" />
        {title}
      </h3>
      {byGroup.size === 0 ? (
        <p className="caption muted">Không có nhóm nào.</p>
      ) : (
        <ul>
          {[...byGroup.values()].map((g) => (
            <li key={g.groupId}>
              <span className="strong">{g.groupName ?? GROUP_LABELS[g.groupType] ?? g.groupType}</span>
              <span className="caption muted">
                {GROUP_LABELS[g.groupType] ?? g.groupType} · {g.names.join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Result({ result, parents, onDetail, backTo }) {
  const { student, fromEnrollment, toEnrollment, groupChanges, warnings } = result;
  const names = new Map([[student.userId, student.fullName], ...parents.map((p) => [p.userId, p.fullName])]);
  const nameOf = (item) => names.get(item.userId) ?? (item.memberType === 'PARENT' ? 'Phụ huynh' : 'Học sinh');
  return (
    <section className="card card-outline transfer-student-result" aria-labelledby="transfer-student-result-title">
      <div className="transfer-student-result-head">
        <Icon name="check_circle" />
        <div>
          <h2 id="transfer-student-result-title" className="title-sm">
            Đã chuyển lớp cho học sinh {student.fullName}
          </h2>
          <p className="caption muted">
            Thời điểm: <span className="mono">{formatDateTime(toEnrollment.enrolledAt)}</span>
          </p>
        </div>
        <span className="stamp">Đã lưu</span>
      </div>

      {warnings.length > 0 && (
        <div className="transfer-student-warnings">
          {warnings.map((w) => (
            <div key={w.code} className="notice amber" role="status">
              <Icon name="warning" size="sm" />
              <div>
                <p className="notice-title">Chuyển lớp đã hoàn tất, còn một việc cần lưu ý</p>
                <p>{warningText(w)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="transfer-student-result-move">
        <div>
          <span className="label-upper">Lớp cũ</span>
          <p className="strong">Lớp {fromEnrollment.className}</p>
          <span className="pill">Đã chuyển lớp</span>
        </div>
        <Icon name="arrow_forward" className="transfer-student-result-arrow" />
        <div>
          <span className="label-upper">Lớp mới</span>
          <p className="strong">Lớp {toEnrollment.className}</p>
          <span className="pill green">Đang học</span>
        </div>
      </div>

      <div className="transfer-student-result-groups">
        <GroupList title="Đã rời nhóm" icon="logout" items={groupChanges.leftGroups} nameOf={nameOf} />
        <GroupList title="Đã vào nhóm" icon="login" items={groupChanges.joinedGroups} nameOf={nameOf} />
      </div>

      <div className="transfer-student-footer">
        <span className="caption muted">Quá trình học của học sinh đã được cập nhật.</span>
        <div className="transfer-student-buttons">
          <Link to={backTo} className="btn btn-secondary">
            Về danh sách
          </Link>
          <button type="button" className="btn btn-primary" onClick={onDetail}>
            <Icon name="person" size="sm" />
            Xem hồ sơ học sinh
          </button>
        </div>
      </div>
    </section>
  );
}

// SCR-11 Student Transfer & Promotion, School Manager only. /students/:studentId/transfer opens the transfer tab
// (UC-10, one student); /students/promote opens the promotion tab (UC-11, many students, PromoteStudentsPanel).
export default function TransferStudentPage() {
  const { studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  if (studentId) return <TransferStudentView />;
  // Back to the transfer page it came from, if any; opened from Student List there is no student to transfer.
  const fromTransfer = Boolean(location.state?.fromTransfer);
  return (
    <PromoteStudentsPanel
      tabs={
        <Tabs
          active="promote"
          onSelect={fromTransfer ? () => navigate(-1) : undefined}
          transferNote="Để chuyển lớp, mở hồ sơ học sinh và chọn Chuyển lớp."
        />
      }
    />
  );
}

// The transfer part (UC-10 Transfer Student).
// Design: Stitch "SCR-10 Student Transfer & Promotion" (a page with two tabs; the promotion tab is UC-11).
// A transfer cannot be undone (UNIQUE (student_id, class_id): no way back to the old class), hence the confirmation.
function TransferStudentView() {
  const { studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, activeRole } = useAuth();
  const listSearch = location.state?.listSearch ?? '';
  // fromDetail: Student Detail is the history entry behind this one, so leaving goes back to it.
  const fromDetail = Boolean(location.state?.fromDetail);
  const backTo = `/students${listSearch}`;
  const detailPath = `/students/${studentId}`;
  const validId = /^[1-9]\d*$/.test(studentId ?? '');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(validId);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState(null); // { classId, className }
  const [classError, setClassError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // a second click before React re-renders must not send a second transfer
  const [result, setResult] = useState(null);

  // Always loads fresh data (also when opened directly): the current class decides what can be submitted.
  useEffect(() => {
    if (!validId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getStudent(studentId, { signal: controller.signal })
      .then((res) => setData(res))
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [studentId, validId, attempt]);

  function toDetail() {
    if (fromDetail) navigate(-1);
    else navigate(detailPath, { replace: true, state: { listSearch } });
  }

  if (!validId) return <NotFound backTo={backTo} />;
  // After a transfer the page only refreshes the history in the background: a failed refresh keeps the result.
  const failed = loadError && !(result && data);
  if (failed && (loadError.status === 404 || loadError.code === 'MSG_STUDENT_NOT_FOUND' || loadError.code === 'MSG_INVALID_PARAM')) {
    return <NotFound backTo={backTo} />;
  }
  if (failed) {
    return (
      <div className="transfer-student">
        <Breadcrumb backTo={backTo} detailPath={detailPath} />
        <div className="form-error" role="alert">
          <Icon name="error" size="sm" />
          <p>{loadError.code === 'NETWORK_ERROR' ? errorText(loadError) : LOAD_ERROR}</p>
        </div>
        <div className="actions-row transfer-student-retry">
          <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="refresh" size="sm" />
            Thử lại
          </button>
          <Link to={backTo} className="btn btn-tertiary">
            Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }
  if ((loading && !result) || !data) return <Skeleton backTo={backTo} detailPath={detailPath} />;

  const { student, currentEnrollment: current, enrollmentHistory, parents } = data;
  // Classes of this school year the student already studied in (or studies in now): the server refuses them
  // (MSG_TRANSFER_SAME_CLASS / MSG_CLASS_ALREADY_ENROLLED), so they cannot be picked. Class names are unique within
  // a school year (classes UNIQUE (class_name, school_year_id)) and the options are the current year's classes.
  const usedNames = new Set(
    current ? enrollmentHistory.filter((e) => e.schoolYearName === current.schoolYearName).map((e) => e.className) : [],
  );
  // Team decision 2026-10-27: a transfer stays within the grade level, so other grade levels are left out of the
  // list altogether (they are never a valid choice, unlike the current or a former class, which are shown locked).
  const sameGradeLevel = (option) => option.gradeLevelName === current?.gradeLevelName;
  const describe = (option) => {
    if (option.name === current?.className) return { disabled: true, note: 'lớp hiện tại' };
    if (usedNames.has(option.name)) return { disabled: true, note: 'đã từng học' };
    return null;
  };
  const toName = target ? (target.className ? `Lớp ${target.className}` : `Lớp mã ${target.classId}`) : '';
  const locked = !current || busy;

  function chooseTarget(value) {
    setTarget(value);
    setClassError('');
    setFormError('');
  }

  function askConfirm(e) {
    e.preventDefault();
    setSubmitted(true);
    if (locked) return;
    if (!target) {
      setClassError('Vui lòng chọn lớp tiếp nhận.');
      document.getElementById('transfer-student-class')?.focus();
      return;
    }
    if (target.classId === current.classId) {
      setClassError(TRANSFER_ERRORS.MSG_TRANSFER_SAME_CLASS);
      return;
    }
    setConfirming(true);
  }

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await transferStudent(student.studentId, target.classId);
      setResult(res);
      setConfirming(false);
      toast(`Đã chuyển học sinh sang lớp ${res.toEnrollment.className}.`);
      setAttempt((n) => n + 1); // refresh the class history beside the result
      window.scrollTo({ top: 0 });
    } catch (err) {
      setConfirming(false);
      if (err.status === 404 || err.code === 'MSG_STUDENT_NOT_FOUND') {
        setLoadError(err);
      } else if (CLASS_ERRORS.includes(err.code)) {
        setClassError(transferErrorText(err));
        document.getElementById('transfer-student-class')?.focus();
      } else {
        setFormError(transferErrorText(err));
        // The student no longer has a class this year (changed meanwhile): reload so the form shows why.
        if (err.code === 'MSG_NO_ACTIVE_ENROLLMENT') setAttempt((n) => n + 1);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="transfer-student">
      <Breadcrumb backTo={backTo} detailPath={detailPath} studentCode={student.studentCode} />
      <div className="page-header">
        <div>
          <span className="label-upper transfer-student-eyebrow">Hồ sơ học sinh</span>
          <h1 className="headline-xl">Chuyển lớp &amp; Lên lớp</h1>
          <p>Chuyển học sinh giữa các lớp trong năm học và lên lớp sang năm học mới.</p>
        </div>
        {current && (
          <div className="transfer-student-metric">
            <span className="label-upper">Năm học hiện tại</span>
            <span className="title-sm mono">{yearLabel(current.schoolYearName)}</span>
          </div>
        )}
      </div>

      <Tabs
        active="transfer"
        onSelect={() =>
          // UC-11 starts on the student's current class and year, so that class is promoted next.
          navigate('/students/promote', {
            state: {
              listSearch,
              fromTransfer: true,
              ...(current && {
                fromSchoolYear: { id: current.schoolYearId, name: current.schoolYearName },
                fromClass: { classId: current.classId, className: current.className },
              }),
            },
          })
        }
      />

      <div className="transfer-student-grid" role="tabpanel" aria-labelledby="transfer-student-tab-transfer">
        {result ? (
          <Result result={result} parents={parents} onDetail={toDetail} backTo={backTo} />
        ) : (
          <form className="card card-outline transfer-student-form" onSubmit={askConfirm} noValidate>
            <div className="transfer-student-form-head">
              <Icon name="swap_horiz" />
              <h2 className="title-sm">
                {current ? `Chuyển học sinh trong cùng năm học ${yearLabel(current.schoolYearName)}` : 'Chuyển học sinh trong cùng năm học'}
              </h2>
            </div>

            <div className="field">
              <span className="field-label">Học sinh cần chuyển</span>
              <div className="transfer-student-who">
                <Avatar src={student.avatarUrl} name={student.fullName} size={32} />
                <span className="strong">{student.fullName}</span>
                <span className="caption muted mono">{student.studentCode}</span>
                <Icon name="check_circle" size="sm" className="transfer-student-who-ok" />
              </div>
            </div>

            {current ? (
              <div className="transfer-student-pair">
                <CurrentClass current={current} />
                <Icon name="arrow_forward" className="transfer-student-pair-arrow" />
                <TargetClassPicker
                  id="transfer-student-class"
                  schoolYearId={current.schoolYearId}
                  value={target}
                  onChange={chooseTarget}
                  include={sameGradeLevel}
                  describe={describe}
                  disabled={busy}
                  error={classError || (submitted && !target ? 'Vui lòng chọn lớp tiếp nhận.' : '')}
                  help={`Chỉ chọn được các lớp khối ${current.gradeLevelName} trong năm học ${yearLabel(current.schoolYearName)}.`}
                />
              </div>
            ) : (
              <div className="notice amber">
                <Icon name="info" size="sm" />
                <div>
                  <p className="notice-title">Học sinh hiện không học ở lớp nào trong năm học này</p>
                  <p>Chỉ chuyển lớp được cho học sinh đang học. Vui lòng xếp lớp cho học sinh trước.</p>
                </div>
              </div>
            )}

            <div className="notice transfer-student-sync">
              <Icon name="info" size="sm" />
              <div>
                <p className="notice-title">Dữ liệu được giữ nguyên</p>
                <p>
                  Toàn bộ điểm và điểm danh ở lớp cũ được giữ lại; lớp cũ ghi nhận học sinh đã chuyển đi. Học sinh và phụ
                  huynh được chuyển sang các nhóm của lớp mới.
                </p>
              </div>
            </div>

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
                <button type="button" className="btn btn-secondary" onClick={toDetail} disabled={busy}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn-primary" disabled={locked}>
                  <Icon name="move_up" size="sm" />
                  Chuyển lớp
                </button>
              </div>
            </div>
          </form>
        )}

        <aside className="transfer-student-aside">
          <HistoryLog history={enrollmentHistory} />
          <Rules />
        </aside>
      </div>

      {current && target && (
        <ConfirmDialog
          open={confirming}
          student={student}
          fromClassName={current.className}
          toName={toName}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
