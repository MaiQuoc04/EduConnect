import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getStudent, updateStudent } from '../../api/students.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, GENDER_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import { handOverDetail } from './detailHandoff.js';
import './UpdateStudentPage.css';

const MAX_FULL_NAME_LENGTH = 150; // users.full_name VARCHAR(150)
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const REQUIRED = 'Trường này là bắt buộc.'; // MSG02
const LOAD_ERROR = 'Không tải được thông tin học sinh. Vui lòng thử lại.';
const SAVE_ERROR = 'Không lưu được thông tin học sinh. Vui lòng thử lại.';
const EMPTY_VALUE = 'Chưa cập nhật';
const SA_ONLY = 'Chỉ Quản trị hệ thống thay đổi được.';
// Shown when the server rejects a value with a code messages.js does not have yet (MSG_INVALID_PARAM is waiting for
// approval). The age range is the server's to decide, so it is not repeated here.
const SERVER_FIELD_ERRORS = {
  fullName: 'Họ và tên không hợp lệ.',
  dob: 'Ngày sinh không hợp lệ hoặc nằm ngoài độ tuổi học sinh cho phép.',
  gender: 'Giới tính không hợp lệ.',
};
const FIELD_LABELS = { fullName: 'Họ và tên', dob: 'Ngày sinh', gender: 'Giới tính' };

// Same normalisation as the server: NFC, trimmed, runs of spaces collapsed.
const normalizeName = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ');

// Local calendar date as "YYYY-MM-DD".
function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// "14/5/2010", "14-05-2010" or "14.05.2010" -> "2010-05-14"; undefined when it is not a real date.
function parseDob(text) {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!match) return undefined;
  const [d, m, y] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Form text -> the value the API would get: a string, null (cleared) or undefined (not a valid date).
function dobValue(text) {
  return text.trim() === '' ? null : parseDob(text);
}

function validate(form) {
  const errors = {};
  const name = normalizeName(form.fullName);
  if (!name) errors.fullName = REQUIRED;
  else if ([...name].length > MAX_FULL_NAME_LENGTH) errors.fullName = `Họ và tên tối đa ${MAX_FULL_NAME_LENGTH} ký tự.`;
  const dob = dobValue(form.dob);
  if (dob === undefined) errors.dob = 'Ngày sinh không hợp lệ. Nhập theo dạng ngày/tháng/năm.';
  else if (dob && dob > todayIso()) errors.dob = 'Ngày sinh không được ở tương lai.';
  if (form.gender && !GENDERS.includes(form.gender)) errors.gender = 'Vui lòng chọn giới tính trong danh sách.';
  return errors;
}

// Only the fields whose value really differs from the loaded student, and only fullName / dob / gender: the server
// rejects any other key (UC-09 does not change login identifiers, student code or nickname).
function changedFields(form, student) {
  const changes = {};
  const name = normalizeName(form.fullName);
  if (name !== student.fullName) changes.fullName = name;
  const dob = dobValue(form.dob);
  if (dob !== (student.dob ?? null)) changes.dob = dob;
  const gender = form.gender || null;
  if (gender !== (student.gender ?? null)) changes.gender = gender;
  return changes;
}

const formFromStudent = (student) => ({
  fullName: student.fullName ?? '',
  dob: student.dob ? formatDate(student.dob) : '',
  gender: student.gender ?? '',
});

/**
 * Asks before leaving the page with unsaved changes: in-app links (sidebar, breadcrumb), the browser Back button and
 * closing / reloading the tab.
 *
 * The app uses <BrowserRouter>, where React Router's useBlocker is not available (it needs a data router), so Back is
 * caught with an extra history entry: while the form is dirty one copy of the current entry is pushed; Back pops it,
 * the page stays, and the dialog opens. TODO: replace with useBlocker if main.jsx moves to createBrowserRouter.
 *
 * leave(action, extraBack) is the only way out of the page: it removes that extra entry (plus `extraBack` entries
 * behind it) and then runs action.
 */
function useLeaveGuard(dirty) {
  const armed = useRef(false);
  const leaving = useRef(false);
  const afterPop = useRef(null);
  const ignorePops = useRef(0);
  const [asking, setAsking] = useState(null); // { to } for a link, { back: true } for the Back button, { cancel: true }

  const leave = useCallback((action, extraBack = 0) => {
    leaving.current = true;
    const steps = (armed.current ? 1 : 0) + extraBack;
    armed.current = false;
    if (steps === 0) {
      action?.();
      return;
    }
    afterPop.current = action ?? null;
    window.history.go(-steps);
  }, []);

  useEffect(() => {
    if (leaving.current) return;
    if (dirty && !armed.current) {
      window.history.pushState(window.history.state, '', window.location.href);
      armed.current = true;
    } else if (!dirty && armed.current) {
      armed.current = false;
      ignorePops.current += 1;
      window.history.back();
    }
  }, [dirty]);

  useEffect(() => {
    function onPop() {
      if (leaving.current) {
        const action = afterPop.current;
        afterPop.current = null;
        action?.();
      } else if (ignorePops.current > 0) {
        ignorePops.current -= 1;
      } else if (armed.current) {
        armed.current = false;
        setAsking({ back: true });
      }
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(e) {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = '';
    }
    // Capture phase: runs before React Router's <Link> handler. Links of this page that leave on their own carry
    // data-leave-guard="off".
    function onClick(e) {
      if (leaving.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest?.('a[href]');
      if (!link || link.dataset.leaveGuard === 'off' || link.hasAttribute('download')) return;
      if (link.target && link.target !== '_self') return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      setAsking({ to: url.pathname + url.search + url.hash });
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  // "Keep editing" after Back: put the extra entry back.
  const stay = useCallback(() => {
    if (asking?.back && !armed.current) {
      window.history.pushState(window.history.state, '', window.location.href);
      armed.current = true;
    }
    setAsking(null);
  }, [asking]);

  return { asking, setAsking, stay, leave };
}

function LeaveDialog({ open, onStay, onLeave }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="update-student-dialog"
      aria-labelledby="update-student-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onStay();
      }}
    >
      <div className="update-student-dialog-body">
        <Icon name="edit_note" />
        <div>
          <h2 id="update-student-dialog-title" className="title-sm">
            Bỏ các thay đổi chưa lưu?
          </h2>
          <p className="muted">Những thông tin bạn vừa sửa sẽ không được lưu nếu rời trang này.</p>
        </div>
      </div>
      <div className="update-student-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onStay} autoFocus>
          Tiếp tục chỉnh sửa
        </button>
        <button type="button" className="btn btn-primary" onClick={onLeave}>
          Bỏ thay đổi
        </button>
      </div>
    </dialog>
  );
}

function Breadcrumb({ backTo, detailPath, studentCode, onDetailClick }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
      {studentCode && (
        <>
          /
          <Link to={detailPath} className="mono" data-leave-guard="off" onClick={onDetailClick}>
            {studentCode}
          </Link>
        </>
      )}
      /<span className="current">Chỉnh sửa thông tin</span>
    </nav>
  );
}

function Skeleton({ backTo, detailPath }) {
  return (
    <div className="update-student" aria-busy="true">
      <Breadcrumb backTo={backTo} detailPath={detailPath} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chỉnh sửa thông tin học sinh</h1>
          <p>Đang tải thông tin học sinh…</p>
        </div>
      </div>
      <div className="card card-outline update-student-skeleton" aria-hidden="true">
        <span className="block" />
        <span className="block" />
        <span className="block short" />
        <span className="block" />
      </div>
    </div>
  );
}

function NotFound({ backTo }) {
  return (
    <div className="update-student">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
      </nav>
      <section className="card card-outline update-student-missing">
        <Icon name="person_search" />
        <h1 className="title-md">Không tìm thấy học sinh</h1>
        <p className="muted">Học sinh này không tồn tại hoặc đường dẫn không đúng.</p>
        <Link to={backTo} className="btn btn-primary" data-leave-guard="off">
          <Icon name="arrow_back" size="sm" />
          Quay lại danh sách
        </Link>
      </section>
    </div>
  );
}

// multiline: a long value (the address) wraps in a box instead of being cut by a one-line input.
function ReadOnlyField({ label, value, help, mono, multiline, wide }) {
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <span className="field-label">{label}</span>
      <div className="input-wrap">
        {multiline ? (
          <div
            className={`input update-student-locked update-student-locked-text${value ? '' : ' empty'}`}
            role="textbox"
            aria-readonly="true"
            aria-multiline="true"
            aria-label={label}
          >
            {value || EMPTY_VALUE}
          </div>
        ) : (
          <input
            className={`input update-student-locked${mono && value ? ' mono' : ''}`}
            value={value || EMPTY_VALUE}
            readOnly
            aria-readonly="true"
            aria-label={label}
          />
        )}
        <Icon name="lock" size="sm" className="update-student-lock-icon" />
      </div>
      <span className="field-help">{help}</span>
    </div>
  );
}

function FieldMessage({ id, error, help }) {
  if (error) {
    return (
      <span id={id} className="field-error" role="alert">
        {error}
      </span>
    );
  }
  return (
    <span id={id} className="field-help">
      {help}
    </span>
  );
}

// SCR-09 Update Student (UC-09), School Manager only. Edits full name, date of birth and gender – nothing else:
// username, email and phone belong to System Admin (UC-99, business-rules §3), the student code is the matching key
// of the class import (UC-27) and the class nickname belongs to the homeroom teacher (UC-34). Design: Stitch "SCR-09
// Update Student" (a page of its own, not a dialog).
export default function UpdateStudentPage() {
  const { studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const listSearch = location.state?.listSearch ?? '';
  // fromDetail: the Student Detail entry is right behind this one in the history, so leaving goes back to it
  // instead of stacking a second copy.
  const fromDetail = Boolean(location.state?.fromDetail);
  const backTo = `/students${listSearch}`;
  const detailPath = `/students/${studentId}`;
  // Same rule as Student Detail: an id that is not a positive integer is "not found" without calling the API.
  const validId = /^[1-9]\d*$/.test(studentId ?? '');

  const handedOver = location.state?.detail?.student?.studentId === Number(studentId) ? location.state.detail : null;
  const initialData = useRef(handedOver);
  const [data, setData] = useState(handedOver);
  const [form, setForm] = useState(() => (handedOver ? formFromStudent(handedOver.student) : null));
  const [loading, setLoading] = useState(validId && !handedOver);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const datePicker = useRef(null);

  // Keep only the flags in the history entry, so a reload of this page loads fresh data.
  useEffect(() => {
    if (location.state?.detail) {
      navigate(location.pathname, { replace: true, state: { fromDetail: location.state.fromDetail, listSearch } });
    }
  }, [location, navigate, listSearch]);

  // Opened directly (no data handed over by Student Detail): load it.
  useEffect(() => {
    if (!validId) return undefined;
    if (attempt === 0 && initialData.current?.student.studentId === Number(studentId)) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getStudent(studentId, { signal: controller.signal })
      .then((result) => {
        setData(result);
        setForm(formFromStudent(result.student));
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [studentId, validId, attempt]);

  const student = data?.student;
  const changes = form && student ? changedFields(form, student) : {};
  const changedCount = Object.keys(changes).length;
  const dirty = !loadError && (changedCount > 0 || Boolean(form && dobValue(form.dob) === undefined));
  const { asking, setAsking, stay, leave } = useLeaveGuard(dirty);

  // Back to Student Detail with the given data, so it shows without a new request. Opened from Student Detail: go
  // back to that history entry; opened directly: replace this entry with the detail page.
  const backToDetail = useCallback(
    (detail) => {
      handOverDetail(detail);
      if (fromDetail) leave(null, 1);
      else leave(() => navigate(detailPath, { replace: true, state: { listSearch } }));
    },
    [leave, navigate, detailPath, listSearch, fromDetail],
  );

  function cancel(e) {
    e?.preventDefault();
    if (dirty) setAsking({ cancel: true });
    else backToDetail(data);
  }

  function confirmLeave() {
    const target = asking;
    setAsking(null);
    if (target?.to) leave(() => navigate(target.to));
    else if (target?.back) leave(null, 1);
    else backToDetail(data);
  }

  if (!validId) return <NotFound backTo={backTo} />;
  if (loadError && (loadError.status === 404 || loadError.code === 'MSG_STUDENT_NOT_FOUND' || loadError.code === 'MSG_INVALID_PARAM')) {
    return <NotFound backTo={backTo} />;
  }
  if (loadError) {
    const text = errorText({ code: loadError.code, details: loadError.details });
    if (!['NETWORK_ERROR', 'SERVER_ERROR'].includes(loadError.code)) {
      console.warn(`[UpdateStudent] No Vietnamese message for error code ${loadError.code}:`, loadError.message);
    }
    return (
      <div className="update-student">
        <Breadcrumb backTo={backTo} detailPath={detailPath} />
        <div className="form-error" role="alert">
          <Icon name="error" size="sm" />
          <p>{loadError.code === 'NETWORK_ERROR' ? text : LOAD_ERROR}</p>
        </div>
        <div className="actions-row update-student-retry">
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
  if (loading || !data || !form) return <Skeleton backTo={backTo} detailPath={detailPath} />;

  const current = data.currentEnrollment;
  const errors = validate(form);
  const shown = (field) => serverErrors[field] ?? ((touched[field] || submitted) && errors[field]) ?? null;

  function setField(field, value, { touch = true } = {}) {
    setForm((f) => ({ ...f, [field]: value }));
    if (touch) setTouched((t) => ({ ...t, [field]: true }));
    setServerErrors(({ [field]: _removed, ...rest }) => rest);
    setFormError('');
  }

  function openDatePicker() {
    const picker = datePicker.current;
    picker.value = dobValue(form.dob) || '';
    try {
      picker.showPicker();
    } catch {
      picker.focus();
    }
  }

  async function save(e) {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setFormError('');
    const firstInvalid = ['fullName', 'dob', 'gender'].find((f) => errors[f]);
    if (firstInvalid) {
      document.getElementById(`update-student-${firstInvalid}`)?.focus();
      return;
    }
    if (!changedCount) return;
    setSaving(true);
    try {
      const updated = await updateStudent(student.studentId, changes);
      toast('Đã cập nhật thông tin học sinh.');
      backToDetail({ ...data, student: updated });
    } catch (err) {
      setSaving(false);
      if (err.status === 404 || err.code === 'MSG_STUDENT_NOT_FOUND') {
        setLoadError(err);
        return;
      }
      const fallback = errorText({ code: 'SERVER_ERROR' });
      const known = errorText({ code: err.code, details: err.details });
      const hasText = known !== fallback || err.code === 'SERVER_ERROR';
      if (err.code === 'MSG_FIELD_NOT_EDITABLE') {
        // Programming error: this form must only send fullName, dob and gender.
        const fields = err.details?.fields ?? [];
        console.warn('[UpdateStudent] The server refused fields this form must never send:', fields);
        setFormError(`Máy chủ từ chối các trường không được sửa ở màn này: ${fields.join(', ')}. Vui lòng báo cho nhóm phát triển.`);
      } else if (err.code === 'MSG_INVALID_PARAM' && SERVER_FIELD_ERRORS[err.details?.field]) {
        const field = err.details.field;
        if (!hasText) console.warn(`[UpdateStudent] No Vietnamese message for ${err.code} (${field}):`, err.message);
        setServerErrors({ [field]: hasText ? known : SERVER_FIELD_ERRORS[field] });
        document.getElementById(`update-student-${field}`)?.focus();
      } else {
        if (!hasText) console.warn(`[UpdateStudent] No Vietnamese message for error code ${err.code}:`, err.message);
        setFormError(hasText ? known : SAVE_ERROR);
      }
    }
  }

  const nameError = shown('fullName');
  const dobError = shown('dob');
  const genderError = shown('gender');

  return (
    <div className="update-student">
      <Breadcrumb backTo={backTo} detailPath={detailPath} studentCode={student.studentCode} onDetailClick={cancel} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chỉnh sửa thông tin học sinh</h1>
          <p>
            Cập nhật hồ sơ học sinh <span className="strong">{student.fullName}</span> · Mã HS:{' '}
            <span className="mono">{student.studentCode}</span>
            {current && <> · Lớp {current.className}</>}
          </p>
        </div>
        <Link to={detailPath} className="btn btn-tertiary update-student-back" data-leave-guard="off" onClick={cancel}>
          <Icon name="arrow_back" size="sm" />
          Hồ sơ chi tiết
        </Link>
      </div>

      <form className="card card-outline update-student-sheet" onSubmit={save} noValidate>
        <section className="update-student-section" aria-labelledby="update-student-basic">
          <div className="update-student-section-head">
            <h2 id="update-student-basic" className="title-sm">
              1. Thông tin cơ bản
            </h2>
            <span className="caption muted">Mục đánh dấu (*) là bắt buộc</span>
          </div>
          <div className="update-student-grid">
            <div className={`field wide${nameError ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="update-student-fullName">
                <span>
                  Họ và tên học sinh <span className="update-student-required">*</span>
                </span>
              </label>
              <div className="input-wrap">
                <input
                  id="update-student-fullName"
                  className="input"
                  value={form.fullName}
                  onChange={(e) => setField('fullName', e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
                  autoComplete="off"
                  disabled={saving}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby="update-student-fullName-msg"
                />
              </div>
              <FieldMessage
                id="update-student-fullName-msg"
                error={nameError}
                help="Ghi chính xác theo giấy khai sinh."
              />
            </div>

            <div className={`field${dobError ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="update-student-dob">
                Ngày sinh
              </label>
              <div className="input-wrap">
                <input
                  id="update-student-dob"
                  className="input has-action mono"
                  value={form.dob}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(e) => setField('dob', e.target.value, { touch: false })}
                  onBlur={() => {
                    setTouched((t) => ({ ...t, dob: true }));
                    const iso = dobValue(form.dob);
                    if (iso) setForm((f) => ({ ...f, dob: formatDate(iso) }));
                  }}
                  disabled={saving}
                  aria-invalid={Boolean(dobError)}
                  aria-describedby="update-student-dob-msg"
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={openDatePicker}
                  disabled={saving}
                  aria-label="Chọn ngày sinh trên lịch"
                >
                  <Icon name="calendar_today" size="sm" />
                </button>
                {/* Native picker behind the calendar button; the text field stays the source of truth. */}
                <input
                  ref={datePicker}
                  type="date"
                  className="update-student-picker"
                  max={todayIso()}
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    if (e.target.value) setField('dob', formatDate(e.target.value));
                  }}
                />
              </div>
              <FieldMessage id="update-student-dob-msg" error={dobError} help="Định dạng: ngày/tháng/năm." />
            </div>

            <div className={`field${genderError ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="update-student-gender">
                Giới tính
              </label>
              <div className="input-wrap">
                <select
                  id="update-student-gender"
                  className="input update-student-select"
                  value={form.gender}
                  onChange={(e) => setField('gender', e.target.value)}
                  disabled={saving}
                  aria-invalid={Boolean(genderError)}
                  aria-describedby="update-student-gender-msg"
                >
                  {/* ASSUMPTION: "not set" is offered only while the student has no gender yet, so a recorded
                      gender is not cleared by accident. */}
                  {!student.gender && <option value="">{EMPTY_VALUE}</option>}
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {GENDER_LABELS[g]}
                    </option>
                  ))}
                </select>
                <Icon name="unfold_more" size="sm" className="update-student-select-icon" />
              </div>
              <FieldMessage id="update-student-gender-msg" error={genderError} help="Theo giấy khai sinh của học sinh." />
            </div>
          </div>
        </section>

        <section className="update-student-section is-readonly" aria-labelledby="update-student-account">
          <div className="update-student-section-head">
            <h2 id="update-student-account" className="title-sm">
              2. Thông tin tài khoản hệ thống (chỉ đọc)
            </h2>
            <span className="caption muted update-student-locked-note">
              <Icon name="lock" size="sm" />
              Không sửa ở màn này
            </span>
          </div>
          <div className="notice amber update-student-notice">
            <Icon name="lock_person" />
            <div>
              <p className="notice-title">Chỉ Quản trị hệ thống mới thay đổi được tên đăng nhập, email và số điện thoại.</p>
              <p className="caption">Nếu cần điều chỉnh các thông tin này, vui lòng liên hệ Quản trị hệ thống của trường.</p>
            </div>
          </div>
          <div className="update-student-grid">
            <ReadOnlyField
              label="Mã học sinh"
              value={student.studentCode}
              mono
              help="Mã do nhà trường cấp, dùng để đối chiếu khi nhập danh sách lớp."
            />
            <ReadOnlyField label="Tên đăng nhập" value={student.username} mono help={SA_ONLY} />
            <ReadOnlyField label="Email" value={student.email} help={SA_ONLY} />
            <ReadOnlyField label="Số điện thoại" value={student.phone} mono help={SA_ONLY} />
            {/* ASSUMPTION: not editable and no owner named until the team decides who updates a student's address. */}
            <ReadOnlyField
              label="Địa chỉ"
              value={student.address}
              multiline
              wide
              help="Chưa sửa được ở màn này."
            />
          </div>
        </section>

        {formError && (
          <div className="form-error update-student-form-error" role="alert">
            <Icon name="error" size="sm" />
            <p>{formError}</p>
          </div>
        )}

        <div className="update-student-footer">
          <span className="update-student-status caption">
            <Icon name="edit_note" size="sm" />
            {changedCount
              ? `${changedCount} trường đã thay đổi: ${Object.keys(changes).map((f) => FIELD_LABELS[f]).join(', ')}`
              : 'Chưa có thay đổi nào'}
          </span>
          <div className="update-student-buttons">
            <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>
              Huỷ
            </button>
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
              <Icon name={saving ? 'progress_activity' : 'check'} size="sm" className={saving ? 'update-student-spin' : undefined} />
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </form>

      <LeaveDialog open={Boolean(asking)} onStay={stay} onLeave={confirmLeave} />
    </div>
  );
}
