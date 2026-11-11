import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDepartmentOptions, getSubjectOptions, getTeacher, updateTeacher } from '../../api/teachers.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import {
  checkPersonName,
  foldVietnamese,
  formatPhone,
  LIMITS,
  NAME_REASON_TEXT as NAME_TEXT,
  validateFullName,
} from '../../utils/teacherValidation.js';
import './TeacherEditPage.css';

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// "2026-10-27 14:28" -> "14:28 · 27/10/2026"
function formatDateTime(value) {
  if (!value) return null;
  const [d, t] = String(value).split(' ');
  return t ? `${t} · ${formatDate(d)}` : formatDate(d);
}

// Client-side checks mirror the server (modules/teacher/teacher.validation.js + teacher.text.js).
// `outside` = names of subjects added now that belong to another department (business-rules §4, 07/11/2026).
function validate(form, outside = []) {
  const errors = {};
  const name = validateFullName(form.fullName);
  if (name.error) errors.fullName = name.error;
  if (!form.subjectIds.length) errors.subjectIds = 'Chọn ít nhất một môn chuyên môn.';
  else if (outside.length) {
    errors.subjectIds = `Môn ${outside.join(', ')} thuộc tổ khác. Chỉ thêm được môn của tổ đã chọn hoặc môn chưa thuộc tổ nào.`;
  }
  return errors;
}

// Errors shown while typing (a wrong character); the others (empty, too short…) wait until the field is left.
const LIVE_REASONS = new Set(['HAS_DIGIT', 'INVALID_CHAR', 'TOO_LONG']);
function liveError(name, value) {
  if (name !== 'fullName') return null;
  const check = checkPersonName(value, { min: LIMITS.FULL_NAME_MIN_LETTERS, max: LIMITS.FULL_NAME_MAX });
  return LIVE_REASONS.has(check.reason) ? NAME_TEXT[check.reason] : null;
}

// Department select values: '' = no department, an id = that department, KEEP = an old name that is not in the
// list (typed before 02/11/2026) – kept as it is unless the School Manager picks another one.
const KEEP = '__keep';
const sameName = (a, b) => foldVietnamese(String(a ?? '').trim().replace(/\s+/g, ' ')) === foldVietnamese(String(b ?? '').trim().replace(/\s+/g, ' '));
function initialDepartment(current, departments) {
  if (!current) return '';
  const exact = departments.find((d) => d.name === current) ?? departments.find((d) => sameName(d.name, current));
  return exact ? String(exact.departmentId) : KEEP;
}

// ── Subject chips + "Thêm môn" picker ───────────────────────────────────────
// isAllowed(option): the subject can be added (its department is the teacher's, or it has none – UC-114).
// original: subjects saved on the profile – they stay even when outside the department, with a warning.
function SubjectPicker({ options, value, locked, onChange, invalid, isAllowed = () => true, original = [], scopeText }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    function onDown(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const byId = useMemo(() => Object.fromEntries(options.map((o) => [String(o.subjectId), o])), [options]);
  const q = foldVietnamese(query.trim());
  const addable = options.filter((o) => !value.includes(String(o.subjectId)) && isAllowed(o));
  const available = addable.filter((o) => !q || foldVietnamese(o.name).includes(q) || foldVietnamese(o.code).includes(q));

  function add(id) {
    onChange([...value, id]);
    setQuery('');
  }

  return (
    <div className={`te-picker${invalid ? ' te-picker--invalid' : ''}`} ref={ref}>
      {value.map((id) => {
        const isLocked = locked[id];
        const outside = byId[id] && !isAllowed(byId[id]);
        const kept = outside && original.includes(id);
        return (
          <span key={id} className={`te-chip${isLocked ? ' te-chip--locked' : ''}${outside ? (kept ? ' te-chip--warn' : ' te-chip--bad') : ''}`}
            title={outside ? (kept ? 'Môn đã có từ trước, không thuộc tổ đã chọn' : 'Môn thuộc tổ khác – hãy bỏ môn này') : undefined}>
            {outside && <Icon name={kept ? 'info' : 'error'} size="sm" />}
            {byId[id]?.name ?? 'Môn đã xoá'}
            {isLocked ? (
              <span className="te-chip-lock" title={`Đang dạy ${isLocked.join(', ')} – không thể bỏ`}>
                <Icon name="lock" size="sm" />
              </span>
            ) : (
              <button
                type="button"
                className="te-chip-remove"
                aria-label={`Bỏ môn ${byId[id]?.name ?? ''}`}
                onClick={() => onChange(value.filter((x) => x !== id))}
              >
                <Icon name="close" size="sm" />
              </button>
            )}
          </span>
        );
      })}

      <div className="te-add">
        <button
          type="button"
          className="te-add-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          disabled={addable.length === 0}
          title={addable.length === 0 ? 'Không còn môn nào thêm được cho tổ này' : undefined}
        >
          <Icon name="add" size="sm" /> Thêm môn
        </button>
        {open && (
          <div className="te-dropdown">
            <input
              ref={searchRef}
              className="te-dropdown-search"
              maxLength={50}
              placeholder="Tìm môn…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (available[0]) add(String(available[0].subjectId));
                }
              }}
            />
            {scopeText && <div className="te-dropdown-scope">{scopeText}</div>}
            <div className="te-dropdown-list" role="listbox">
              {available.length === 0 ? (
                <div className="te-dropdown-empty">Không còn môn phù hợp</div>
              ) : (
                available.map((o) => (
                  <button
                    key={o.subjectId}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="te-dropdown-item"
                    onClick={() => add(String(o.subjectId))}
                  >
                    <span>{o.name}</span>
                    <span className="te-dropdown-code">{o.code}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Read-only identity field ────────────────────────────────────────────────
function LockedField({ label, value, help }) {
  return (
    <div className="field">
      <span className="field-label te-locked-label">
        <span>{label}</span>
        <Icon name="lock" size="sm" />
      </span>
      <input className="input te-readonly" value={value || 'Chưa cập nhật'} readOnly tabIndex={-1} aria-readonly="true" />
      {help && <span className="field-help">{help}</span>}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
// SCR-17 Update Teacher (UC-17): School Manager edits full name, department and subjects.
// Username, email and phone are login identifiers – System Admin only (UC-99).
export default function TeacherEditPage() {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [teacher, setTeacher] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [options, setOptions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentsError, setDepartmentsError] = useState(null);
  const [initialDept, setInitialDept] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    // The department list is optional for the page: if it cannot load, the rest of the form still works.
    const deptsPromise = getDepartmentOptions().catch((err) => ({ error: errorText(err) }));
    Promise.all([getTeacher(teacherId), getSubjectOptions(), deptsPromise])
      .then(([detail, opts, depts]) => {
        if (cancelled) return;
        const list = depts.error ? [] : depts.departments;
        const dept = depts.error ? KEEP : initialDepartment(detail.teacher.department, list);
        setTeacher(detail.teacher);
        setAssignments(detail.assignments);
        setOptions(opts.subjects);
        setDepartments(list);
        setDepartmentsError(depts.error ?? null);
        setInitialDept(dept);
        setForm({
          fullName: detail.teacher.fullName ?? '',
          departmentId: dept,
          subjectIds: detail.teacher.subjects.map((s) => String(s.subjectId)),
        });
      })
      .catch((err) => !cancelled && setLoadError(errorText(err)));
    return () => { cancelled = true; };
  }, [teacherId]);

  // Subjects still used by a current assignment cannot be removed (business-rules §4); the server checks it too.
  const locked = useMemo(() => {
    const map = {};
    for (const a of assignments) {
      if (!a.isActive) continue;
      (map[String(a.subjectId)] ??= []).push(a.className);
    }
    return map;
  }, [assignments]);

  // UC-114: subjects that can be added = subjects of the chosen department + subjects of no department.
  // '' or an old name not in the list (KEEP) = no department → only subjects of no department.
  const deptId = form && form.departmentId !== KEEP ? form.departmentId : '';
  const isAllowed = useCallback(
    (o) => o.departmentId == null || (deptId !== '' && String(o.departmentId) === deptId),
    [deptId],
  );
  const originalSubjects = useMemo(() => (teacher ? teacher.subjects.map((s) => String(s.subjectId)) : []), [teacher]);
  const outsideAdded = useMemo(() => {
    if (!form) return [];
    const byId = Object.fromEntries(options.map((o) => [String(o.subjectId), o]));
    return form.subjectIds.filter((id) => !originalSubjects.includes(id) && byId[id] && !isAllowed(byId[id])).map((id) => byId[id].name);
  }, [form, options, originalSubjects, isAllowed]);
  const deptName = departments.find((d) => String(d.departmentId) === deptId)?.name;

  const dirty = useMemo(() => {
    if (!form || !teacher) return false;
    return (
      validateFullName(form.fullName).value !== teacher.fullName ||
      form.departmentId !== initialDept ||
      !sameSet(form.subjectIds, teacher.subjects.map((s) => String(s.subjectId)))
    );
  }, [form, teacher, initialDept]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: touched[name] ? validate({ ...form, [name]: value })[name] : liveError(name, value) ?? undefined, form: undefined }));
  }

  // Leaving a text field: show every error, and show the value as it will be saved ("phạm  thu hà" → "Phạm Thu Hà").
  function handleBlur(name) {
    setTouched((t) => ({ ...t, [name]: true }));
    const check = validateFullName(form[name]);
    if (!check.error && check.value !== form[name]) setForm((f) => ({ ...f, [name]: check.value }));
    setErrors((e) => ({ ...e, [name]: check.error ?? undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const found = validate(form, outsideAdded);
    setErrors(found);
    setTouched({ fullName: true });
    if (Object.keys(found).length) {
      document.getElementById(found.fullName ? 'te-full-name' : 'te-subjects-label')?.focus();
      return;
    }

    setSaving(true);
    try {
      const body = { fullName: validateFullName(form.fullName).value, subjectIds: form.subjectIds.map(Number) };
      // departmentId is sent only when it changed (omitted = the server keeps the current department)
      if (form.departmentId !== initialDept && form.departmentId !== KEEP) {
        body.departmentId = form.departmentId ? Number(form.departmentId) : null;
      }
      await updateTeacher(teacherId, body);
      toast('Đã lưu thông tin giáo viên.');
      navigate(`/teachers/${teacherId}`);
    } catch (err) {
      const message = errorText(err);
      const field = err.details?.field;
      const target = field ?? (err.code === 'MSG_SUBJECT_IN_USE' ? 'subjectIds' : null);
      setErrors(target && ['fullName', 'departmentId', 'subjectIds'].includes(target) ? { [target]: message } : { form: message });
    } finally {
      setSaving(false);
    }
  }

  const backTo = `/teachers/${teacherId}`;

  return (
    <div className="te-page">
      <div className="te-top">
        <Link to={backTo} className="te-back">
          <Icon name="arrow_back" size="sm" /> Hồ sơ giáo viên
        </Link>
        <span className="stamp-badge">SCR-17</span>
      </div>
      <nav className="te-breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>
        <span>/</span>
        <span>Hồ sơ</span>
        <span>/</span>
        <Link to="/teachers">Giáo viên</Link>
        <span>/</span>
        {teacher ? <Link to={backTo}>{teacher.fullName}</Link> : <span>…</span>}
        <span>/</span>
        <strong>Sửa thông tin</strong>
      </nav>
      <header className="te-heading">
        <h1 className="headline-lg">Chỉnh sửa thông tin giáo viên</h1>
        <p>Cập nhật họ tên, tổ chuyên môn và các môn giáo viên được phép giảng dạy.</p>
      </header>

      {loadError && (
        <div className="te-card te-load-error">
          <Icon name="error_outline" />
          <div>
            <p>{loadError}</p>
            <Link to="/teachers" className="btn btn-secondary">Về danh sách giáo viên</Link>
          </div>
        </div>
      )}

      {!loadError && !form && (
        <div aria-busy="true" aria-label="Đang tải">
          <div className="te-card te-skeleton" style={{ height: 96 }} />
          <div className="te-card te-skeleton" style={{ height: 360, marginTop: 24 }} />
        </div>
      )}

      {form && teacher && (
        <>
          {/* Identity strip */}
          <section className="te-card te-identity">
            <div className="te-identity-main">
              <Avatar src={teacher.avatarUrl} name={teacher.fullName} size={56} />
              <div>
                <div className="te-identity-name">
                  <span className="title-sm">{teacher.fullName}</span>
                  {teacher.status === 'LOCKED'
                    ? <span className="pill red">Đã khoá</span>
                    : <span className="pill green">Đang công tác</span>}
                </div>
                <p className="te-identity-meta">
                  Mã GV: <span className="te-mono">{teacher.teacherCode}</span>
                  {teacher.department ? ` · ${teacher.department}` : ''}
                </p>
              </div>
            </div>
            {teacher.updatedAt && (
              <div className="te-identity-aside">
                <span className="label-upper">Cập nhật gần nhất</span>
                <span>{formatDateTime(teacher.updatedAt)}</span>
              </div>
            )}
          </section>

          <form className="te-form" onSubmit={handleSubmit} noValidate>
            {/* Section 1 */}
            <section className="te-card te-section">
              <div className="te-section-head">
                <h2 className="title-sm"><span className="te-bullet" />1. Thông tin hồ sơ</h2>
                <span className="te-required-note">Mục có <span className="te-req">*</span> là bắt buộc</span>
              </div>

              <div className="te-grid">
                <div className={`field${errors.fullName ? ' invalid' : ''}`}>
                  <label className="field-label" htmlFor="te-full-name">
                    <span>Họ và tên <span className="te-req">*</span></span>
                  </label>
                  <div className="input-wrap">
                    <input
                      id="te-full-name"
                      className="input"
                      value={form.fullName}
                      maxLength={LIMITS.FULL_NAME_MAX}
                      onChange={(e) => setField('fullName', e.target.value)}
                      onBlur={() => handleBlur('fullName')}
                      aria-invalid={Boolean(errors.fullName)}
                      aria-describedby="te-full-name-msg"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="te-field-foot" id="te-full-name-msg">
                    {errors.fullName
                      ? <span className="field-error" role="alert">{errors.fullName}</span>
                      : <span className="field-help">Chỉ gồm chữ cái và khoảng trắng; chữ đầu mỗi từ tự viết hoa.</span>}
                    <span className="te-counter">{form.fullName.length}/{LIMITS.FULL_NAME_MAX}</span>
                  </div>
                </div>

                <div className={`field${errors.departmentId ? ' invalid' : ''}`}>
                  <label className="field-label" htmlFor="te-department">
                    <span>Tổ chuyên môn</span>
                  </label>
                  <div className="input-wrap te-select-wrap">
                    <select
                      id="te-department"
                      className="input te-select"
                      value={form.departmentId}
                      onChange={(e) => setField('departmentId', e.target.value)}
                      disabled={Boolean(departmentsError)}
                      aria-invalid={Boolean(errors.departmentId)}
                      aria-describedby="te-department-msg"
                    >
                      <option value="">— Chưa thuộc tổ nào —</option>
                      {form.departmentId === KEEP && teacher.department && (
                        <option value={KEEP}>{teacher.department}{departmentsError ? '' : ' (tên cũ, không có trong danh sách)'}</option>
                      )}
                      {departments.map((d) => (
                        <option key={d.departmentId} value={String(d.departmentId)}>{d.name}</option>
                      ))}
                    </select>
                    <Icon name="expand_more" className="te-select-icon" />
                  </div>
                  <div className="te-field-foot" id="te-department-msg">
                    {errors.departmentId ? (
                      <span className="field-error" role="alert">{errors.departmentId}</span>
                    ) : form.departmentId === KEEP && !departmentsError ? (
                      <span className="field-help">Tên tổ cũ không có trong danh sách – hãy chọn lại một tổ chuẩn.</span>
                    ) : (
                      <span className="field-help">Chọn trong danh sách tổ của trường để mọi giáo viên cùng tổ ghi giống nhau.</span>
                    )}
                  </div>
                </div>

                <div className={`field te-wide${errors.subjectIds ? ' invalid' : ''}`}>
                  <span className="field-label" id="te-subjects-label" tabIndex={-1}>
                    <span>Môn chuyên môn <span className="te-req">*</span></span>
                  </span>
                  <SubjectPicker
                    options={options}
                    value={form.subjectIds}
                    locked={locked}
                    invalid={Boolean(errors.subjectIds) || outsideAdded.length > 0}
                    isAllowed={isAllowed}
                    original={originalSubjects}
                    scopeText={deptName ? `Môn của ${deptName} và môn chưa thuộc tổ nào` : 'Chưa chọn tổ: chỉ hiện môn chưa thuộc tổ nào'}
                    onChange={(ids) => setField('subjectIds', ids)}
                  />
                  {errors.subjectIds ? (
                    <span className="field-error">{errors.subjectIds}</span>
                  ) : outsideAdded.length ? (
                    <span className="field-error">
                      Môn {outsideAdded.join(', ')} thuộc tổ khác. Hãy bỏ môn này hoặc chọn lại tổ chuyên môn.
                    </span>
                  ) : (
                    <span className="field-help">
                      Chỉ thêm được môn của tổ đã chọn và môn chưa thuộc tổ nào (<Link to="/departments">xem tổ chuyên môn</Link>).
                      Môn có biểu tượng khoá đang được phân công nên chưa thể bỏ.
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section className="te-card te-section">
              <div className="te-section-head">
                <h2 className="title-sm"><Icon name="verified_user" className="te-head-icon" />2. Thông tin tài khoản (chỉ đọc)</h2>
              </div>
              <div className="notice amber te-notice">
                <Icon name="lock" />
                <div>Chỉ Quản trị hệ thống mới sửa được tên đăng nhập, email và số điện thoại của tài khoản.</div>
              </div>
              <div className="te-grid te-grid--3">
                <LockedField label="Tên đăng nhập" value={teacher.username} />
                <LockedField label="Email" value={teacher.email} />
                <LockedField label="Số điện thoại" value={teacher.phone ? formatPhone(teacher.phone) : null} />
              </div>
            </section>

            {errors.form && (
              <div className="form-error" role="alert">
                <Icon name="error" size="sm" /> {errors.form}
              </div>
            )}

            <div className="te-actions">
              <span className="te-dirty">{dirty ? 'Có thay đổi chưa lưu' : 'Chưa có thay đổi'}</span>
              <div className="te-buttons">
                <Link to={backTo} className="btn btn-secondary">Huỷ</Link>
                <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
                  <Icon name="save" size="sm" /> {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
