import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createDepartment, deleteDepartment, getDepartments, updateDepartment } from '../../api/departments.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { foldVietnamese } from '../../utils/teacherValidation.js';
import './DepartmentsPage.css';

// UC-114 Manage Departments (FE-03, School Manager, agreed 07/11/2026). A department (tổ chuyên môn) has a name and
// a fixed set of subjects; a subject belongs to at most one department. On Update Teacher a teacher can only get
// subjects of their department or subjects of no department. Renaming a department renames it on its teachers too.

const NAME_MAX = 100;
// Same rule as the server (teacher.text.js checkDepartmentName).
const NAME_ALLOWED = /^[\p{L}\p{M}\p{N} .,\-‐-―()&/']+$/u;
const cleanName = (v) => v.normalize('NFC').replace(/\s+/g, ' ').trim();
const nameKey = (v) => foldVietnamese(cleanName(v).replace(/[‐-―−]/g, '-'));

function nameError(value, others) {
  const v = cleanName(value);
  if (!v) return 'Vui lòng nhập tên tổ chuyên môn.';
  if (!NAME_ALLOWED.test(v)) return "Tên tổ chỉ gồm chữ, số, khoảng trắng và các dấu . , - – ( ) & / '.";
  if (!/\p{L}/u.test(v)) return 'Tên tổ phải có chữ cái.';
  if (v.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return 'Tên tổ cần ít nhất 2 chữ cái hoặc chữ số.';
  if (v.length > NAME_MAX) return `Tên tổ tối đa ${NAME_MAX} ký tự.`;
  const same = others.find((d) => nameKey(d.name) === nameKey(v));
  if (same) return `Đã có tổ “${same.name}”.`;
  return null;
}

// Create / edit panel. `department` = null for a new one.
function Editor({ department, departments, subjects, onSaved, onCancel }) {
  const toast = useToast();
  const [name, setName] = useState(department?.name ?? '');
  const [picked, setPicked] = useState(() => new Set((department?.subjects ?? []).map((s) => String(s.subjectId))));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const others = departments.filter((d) => d.departmentId !== department?.departmentId);
  const deptName = useMemo(() => Object.fromEntries(departments.map((d) => [String(d.departmentId), d.name])), [departments]);
  const ownId = department ? String(department.departmentId) : null;
  const err = nameError(name, others);
  const initial = new Set((department?.subjects ?? []).map((s) => String(s.subjectId)));
  const dirty = cleanName(name) !== (department?.name ?? '') || picked.size !== initial.size || [...picked].some((id) => !initial.has(id));

  // Subjects this department can take (its own and free ones) first, then those of other departments.
  const ordered = useMemo(
    () => [...subjects].sort((a, b) => Number(a.departmentId != null && String(a.departmentId) !== ownId) - Number(b.departmentId != null && String(b.departmentId) !== ownId)),
    [subjects, ownId],
  );

  function toggle(id) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save(e) {
    e.preventDefault();
    setTouched(true);
    if (err) return;
    setSaving(true);
    setError('');
    const body = { name: cleanName(name), subjectIds: [...picked].map(Number) };
    try {
      if (department) await updateDepartment(department.departmentId, body);
      else await createDepartment(body);
      toast(department ? `Đã cập nhật ${body.name}.` : `Đã thêm ${body.name}.`);
      onSaved();
    } catch (ex) {
      setError(errorText(ex));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card card-outline dp-editor" onSubmit={save} noValidate>
      <h2 className="card-title title-sm">
        <Icon name={department ? 'edit' : 'add_circle'} />
        {department ? 'Sửa tổ chuyên môn' : 'Thêm tổ chuyên môn'}
      </h2>

      <div className={`field${touched && err ? ' invalid' : ''}`}>
        <label className="field-label" htmlFor="dp-name">
          Tên tổ <span className="caption muted">{cleanName(name).length}/{NAME_MAX}</span>
        </label>
        <input id="dp-name" className="input" value={name} maxLength={NAME_MAX + 20} autoFocus
          placeholder="Ví dụ: Tổ Toán – Tin" onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)}
          aria-invalid={Boolean(touched && err)} aria-describedby="dp-name-help" />
        <span id="dp-name-help" className={touched && err ? 'field-error' : 'field-help'}>
          {touched && err ? err : department?.teacherCount
            ? `Đổi tên sẽ đổi luôn tên tổ trong hồ sơ của ${department.teacherCount} giáo viên.`
            : 'Tên không được trùng với tổ khác (không phân biệt hoa thường và dấu).'}
        </span>
      </div>

      <div className="field dp-subjects-field">
        <span className="field-label">
          Môn của tổ <span className="caption muted">Đã chọn {picked.size}</span>
        </span>
        <span className="field-help">Mỗi môn chỉ thuộc một tổ. Môn đang thuộc tổ khác cần bỏ khỏi tổ đó trước.</span>
        <div className="dp-subject-list" role="group" aria-label="Môn của tổ">
          {ordered.map((s) => {
            const id = String(s.subjectId);
            const owner = s.departmentId != null ? String(s.departmentId) : null;
            const elsewhere = owner && owner !== ownId;
            return (
              <label key={id} className={`dp-subject${picked.has(id) ? ' is-on' : ''}${elsewhere ? ' is-taken' : ''}`}>
                <input type="checkbox" checked={picked.has(id)} disabled={Boolean(elsewhere)} onChange={() => toggle(id)} />
                <span className="dp-subject-name">{s.name}</span>
                <span className="dp-subject-meta">{elsewhere ? deptName[owner] ?? 'Tổ khác' : s.code}</span>
              </label>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert"><Icon name="error" size="sm" />{error}</p>
      )}
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Huỷ</button>
        <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>
          <Icon name="save" size="sm" /> {saving ? 'Đang lưu…' : department ? 'Lưu thay đổi' : 'Thêm tổ'}
        </button>
      </div>
    </form>
  );
}

export default function DepartmentsPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | departmentId
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setData(await getDepartments());
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const departments = data?.departments ?? [];
  const subjects = data?.subjects ?? [];
  const free = subjects.filter((s) => s.departmentId == null);
  const current = editing && editing !== 'new' ? departments.find((d) => d.departmentId === editing) : null;

  async function remove(d) {
    if (d.teacherCount > 0) {
      toast(`Tổ còn ${d.teacherCount} giáo viên. Hãy chuyển họ sang tổ khác trước khi xoá.`, { type: 'error' });
      return;
    }
    if (!window.confirm(`Xoá ${d.name}? Các môn của tổ sẽ thành môn chưa thuộc tổ nào.`)) return;
    setDeleting(d.departmentId);
    try {
      await deleteDepartment(d.departmentId);
      toast(`Đã xoá ${d.name}.`);
      if (editing === d.departmentId) setEditing(null);
      await load();
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="dp-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to="/teachers">Giáo viên</Link>/<span className="current">Tổ chuyên môn</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Tổ chuyên môn</h1>
          <p>Đặt tên tổ và chọn các môn của từng tổ. Khi sửa hồ sơ, giáo viên chỉ được thêm môn của tổ mình hoặc môn chưa thuộc tổ nào.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} disabled={!data}>
          <Icon name="add" size="sm" /> Thêm tổ
        </button>
      </div>

      {loadError && (
        <div className="notice amber dp-notice"><Icon name="error_outline" />
          <div><p className="notice-title">Không tải được danh sách tổ</p><p>{loadError}</p></div>
          <button type="button" className="btn btn-secondary" onClick={load}>Thử lại</button>
        </div>
      )}

      <div className={`dp-layout${editing ? ' has-editor' : ''}`}>
        <div className="dp-list">
          {loading && !data && <div className="card card-outline dp-skeleton" aria-busy="true" aria-label="Đang tải" />}
          {data && departments.length === 0 && (
            <div className="card card-outline dp-empty">
              <Icon name="account_tree" />
              <p>Trường chưa có tổ chuyên môn nào. Bấm “Thêm tổ” để tạo tổ đầu tiên.</p>
            </div>
          )}
          {departments.map((d) => (
            <article key={d.departmentId} className={`card card-outline dp-card${editing === d.departmentId ? ' is-editing' : ''}`}>
              <header className="dp-card-head">
                <div>
                  <h2 className="title-sm dp-card-name">{d.name}</h2>
                  <span className="caption muted">
                    {d.teacherCount} giáo viên · {d.subjects.length} môn
                  </span>
                </div>
                <div className="dp-card-actions">
                  <button type="button" className="btn btn-tertiary" onClick={() => setEditing(d.departmentId)}>
                    <Icon name="edit" size="sm" /> Sửa
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => remove(d)} disabled={deleting === d.departmentId}
                    title={d.teacherCount ? 'Tổ còn giáo viên nên chưa xoá được' : 'Xoá tổ'}>
                    <Icon name="delete" size="sm" /> Xoá
                  </button>
                </div>
              </header>
              {d.subjects.length ? (
                <div className="chips">{d.subjects.map((s) => <span key={s.subjectId} className="chip ink">{s.name}</span>)}</div>
              ) : (
                <p className="caption muted">Chưa gán môn nào cho tổ này.</p>
              )}
            </article>
          ))}

          {data && (
            <section className="dp-free">
              <h2 className="label-upper">Môn chưa thuộc tổ nào ({free.length})</h2>
              {free.length ? (
                <div className="chips">{free.map((s) => <span key={s.subjectId} className="chip">{s.name}</span>)}</div>
              ) : (
                <p className="caption muted">Mọi môn đều đã thuộc một tổ.</p>
              )}
              <p className="caption muted">Giáo viên của bất kỳ tổ nào cũng được thêm các môn này (ví dụ Hoạt động trải nghiệm do giáo viên chủ nhiệm dạy).</p>
            </section>
          )}
        </div>

        {editing && data && (editing === 'new' || current) && (
          <Editor key={editing} department={current} departments={departments} subjects={subjects}
            onCancel={() => setEditing(null)}
            onSaved={async () => { setEditing(null); await load(); }} />
        )}
      </div>
    </div>
  );
}
