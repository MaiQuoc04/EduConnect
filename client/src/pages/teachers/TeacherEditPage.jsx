import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getSubjectOptions, getTeacher, updateTeacher } from '../../api/teachers.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import './TeacherEditPage.css';

const FULL_NAME_MAX = 150; // users.full_name
const DEPARTMENT_MAX = 100; // teachers.department

const normalizeName = (v) => v.trim().replace(/\s+/g, ' ');
// Accent-insensitive search: "hoa" and "hóa" both find "Hoá học".
const fold = (v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// "2026-10-27 14:28" -> "14:28 · 27/10/2026"
function formatDateTime(value) {
  if (!value) return null;
  const [d, t] = String(value).split(' ');
  return t ? `${t} · ${formatDate(d)}` : formatDate(d);
}

// Client-side checks mirror the server (teacher.service.js updateTeacher).
function validate(form) {
  const errors = {};
  const name = normalizeName(form.fullName);
  if (!name) errors.fullName = 'Vui lòng nhập họ và tên.';
  else if (name.length > FULL_NAME_MAX) errors.fullName = `Họ và tên tối đa ${FULL_NAME_MAX} ký tự.`;
  if (form.department.trim().length > DEPARTMENT_MAX) errors.department = `Tối đa ${DEPARTMENT_MAX} ký tự.`;
  if (!form.subjectIds.length) errors.subjectIds = 'Chọn ít nhất một môn chuyên môn.';
  return errors;
}

// ── Subject chips + "Thêm môn" picker ───────────────────────────────────────
function SubjectPicker({ options, value, locked, onChange, invalid }) {
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
  const q = fold(query.trim());
  const available = options.filter(
    (o) => !value.includes(String(o.subjectId)) && (!q || fold(o.name).includes(q) || fold(o.code).includes(q)),
  );

  function add(id) {
    onChange([...value, id]);
    setQuery('');
  }

  return (
    <div className={`te-picker${invalid ? ' te-picker--invalid' : ''}`} ref={ref}>
      {value.map((id) => {
        const isLocked = locked[id];
        return (
          <span key={id} className={`te-chip${isLocked ? ' te-chip--locked' : ''}`}>
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
          disabled={value.length === options.length}
        >
          <Icon name="add" size="sm" /> Thêm môn
        </button>
        {open && (
          <div className="te-dropdown">
            <input
              ref={searchRef}
              className="te-dropdown-search"
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
// SCR-15 Update Teacher (UC-17): School Manager edits full name, department and subjects.
// Username, email and phone are login identifiers – System Admin only (UC-99).
export default function TeacherEditPage() {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [teacher, setTeacher] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [options, setOptions] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([getTeacher(teacherId), getSubjectOptions()])
      .then(([detail, opts]) => {
        if (cancelled) return;
        setTeacher(detail.teacher);
        setAssignments(detail.assignments);
        setOptions(opts.subjects);
        setForm({
          fullName: detail.teacher.fullName ?? '',
          department: detail.teacher.department ?? '',
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

  const dirty = useMemo(() => {
    if (!form || !teacher) return false;
    return (
      normalizeName(form.fullName) !== teacher.fullName ||
      form.department.trim() !== (teacher.department ?? '') ||
      !sameSet(form.subjectIds, teacher.subjects.map((s) => String(s.subjectId)))
    );
  }, [form, teacher]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined, form: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      await updateTeacher(teacherId, {
        fullName: normalizeName(form.fullName),
        department: form.department.trim(),
        subjectIds: form.subjectIds.map(Number),
      });
      toast('Đã lưu thông tin giáo viên.');
      navigate(`/teachers/${teacherId}`);
    } catch (err) {
      const message = errorText(err);
      const field = err.details?.field;
      setErrors(field ? { [field]: message } : err.code === 'MSG_SUBJECT_IN_USE' ? { subjectIds: message } : { form: message });
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
        <span className="stamp-badge">SCR-15</span>
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
                      maxLength={FULL_NAME_MAX + 20}
                      onChange={(e) => setField('fullName', e.target.value)}
                      aria-invalid={Boolean(errors.fullName)}
                      autoComplete="off"
                    />
                  </div>
                  {errors.fullName
                    ? <span className="field-error">{errors.fullName}</span>
                    : <span className="field-help">Tên đầy đủ theo giấy tờ tuỳ thân.</span>}
                </div>

                <div className={`field${errors.department ? ' invalid' : ''}`}>
                  <label className="field-label" htmlFor="te-department">
                    <span>Tổ chuyên môn</span>
                  </label>
                  <div className="input-wrap">
                    <input
                      id="te-department"
                      className="input"
                      value={form.department}
                      placeholder="Ví dụ: Tổ Toán - Tin"
                      maxLength={DEPARTMENT_MAX + 20}
                      onChange={(e) => setField('department', e.target.value)}
                      aria-invalid={Boolean(errors.department)}
                      autoComplete="off"
                    />
                  </div>
                  {errors.department
                    ? <span className="field-error">{errors.department}</span>
                    : <span className="field-help">Để trống nếu giáo viên chưa thuộc tổ nào.</span>}
                </div>

                <div className={`field te-wide${errors.subjectIds ? ' invalid' : ''}`}>
                  <span className="field-label" id="te-subjects-label">
                    <span>Môn chuyên môn <span className="te-req">*</span></span>
                  </span>
                  <SubjectPicker
                    options={options}
                    value={form.subjectIds}
                    locked={locked}
                    invalid={Boolean(errors.subjectIds)}
                    onChange={(ids) => setField('subjectIds', ids)}
                  />
                  {errors.subjectIds ? (
                    <span className="field-error">{errors.subjectIds}</span>
                  ) : (
                    <span className="field-help">
                      Môn chuyên môn quyết định giáo viên được phân công dạy môn nào. Môn có biểu tượng khoá đang được
                      phân công nên chưa thể bỏ.
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
                <LockedField label="Số điện thoại" value={teacher.phone} />
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
