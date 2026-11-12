import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createActivity, getActivity, getActivityOptions, updateActivity,
} from '../../api/extracurricular.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import ActivityFeedCard from './ActivityFeedCard.jsx';
import { at, dmy } from './activityUtils.js';
import './extracurricular.css';

// SCR-66 Create / Update Event (UC-50, UC-51) – homeroom teacher. Stitch design: form on the left, live preview of
// the feed card on the right. The server checks everything again (times against now and the school year, capacity
// against the registered students, stale save).

const LIMITS = { TITLE_MAX: 120, DESCRIPTION_MAX: 5000, LOCATION_MAX: 255, CAPACITY_MAX: 1000 };
const len = (s) => [...(s ?? '').normalize('NFC').trim()].length;
const split = (t) => (t ? { d: t.slice(0, 10), h: t.slice(11, 16) } : { d: '', h: '' });
const join = (d, h) => (d && h ? `${d}T${h}` : '');

function LeaveDialog({ onStay, onLeave }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onStay();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStay]);
  return (
    <div className="xa-overlay" onClick={onStay}>
      <div className="xa-dialog" role="alertdialog" aria-modal="true" aria-labelledby="xa-leave" onClick={(e) => e.stopPropagation()}>
        <div className="xa-dialog-row">
          <span className="xa-dialog-icon"><Icon name="edit_note" /></span>
          <div><h2 id="xa-leave">Bỏ các thay đổi chưa lưu?</h2><p>Nội dung bạn vừa nhập sẽ mất nếu rời trang.</p></div>
        </div>
        <div className="xa-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onStay}>Ở lại</button>
          <button type="button" className="btn btn-primary" onClick={onLeave}>Rời trang</button>
        </div>
      </div>
    </div>
  );
}

export default function ActivityFormPage() {
  const { eventId } = useParams();
  const editing = Boolean(eventId);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [options, setOptions] = useState(null);
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveTo, setLeaveTo] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadError('');
        setSaveError(null);
        const o = await getActivityOptions();
        let f;
        let orig = null;
        if (editing) {
          orig = await getActivity(eventId);
          const s = split(orig.startAt);
          const e = split(orig.endAt);
          const d = split(orig.registrationDeadline);
          f = {
            classId: String(orig.classId), title: orig.title, description: orig.description, location: orig.location ?? '',
            startDate: s.d, startTime: s.h, endDate: e.d, endTime: e.h, deadlineDate: d.d, deadlineTime: d.h,
            capacity: orig.capacity ? String(orig.capacity) : '',
          };
        } else {
          const asked = o.classes.find((c) => String(c.classId) === params.get('classId'));
          const cls = asked ?? o.classes[0];
          f = {
            classId: cls ? String(cls.classId) : '', title: '', description: '', location: '',
            startDate: '', startTime: '07:00', endDate: '', endTime: '', deadlineDate: '', deadlineTime: '23:59', capacity: '',
          };
        }
        if (!alive) return;
        setOptions(o);
        setOriginal(orig);
        setForm(f);
        setInitial(JSON.stringify(f));
        setTouched(false);
      } catch (err) {
        if (alive) setLoadError(errorText(err));
      }
    })();
    return () => { alive = false; };
  }, [editing, eventId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = form !== null && JSON.stringify(form) !== initial;
  const cls = options?.classes.find((c) => String(c.classId) === form?.classId)
    ?? (original ? { classId: original.classId, className: original.className, classSize: original.classSize } : null);
  const now = options?.now ?? '';

  // Leaving with unsaved changes: browser close / reload, and in-app links (sidebar, breadcrumb, Huỷ).
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e) => {
      const link = e.target.closest?.('a[href]');
      if (!link || link.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search);
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  const startAt = form ? join(form.startDate, form.startTime) : '';
  const endAt = form && (form.endDate || form.endTime) ? join(form.endDate || form.startDate, form.endTime) : '';
  const deadline = form ? join(form.deadlineDate, form.deadlineTime) : '';

  // Same rules as the server, shown before sending.
  const problems = useMemo(() => {
    if (!form) return {};
    const p = {};
    if (!form.classId) p.classId = 'Chọn lớp chủ nhiệm.';
    if (!len(form.title)) p.title = 'Nhập tên hoạt động.';
    else if (len(form.title) > LIMITS.TITLE_MAX) p.title = `Tên hoạt động tối đa ${LIMITS.TITLE_MAX} ký tự.`;
    if (!len(form.description)) p.description = 'Nhập mô tả hoạt động.';
    else if (len(form.description) > LIMITS.DESCRIPTION_MAX) p.description = `Mô tả tối đa ${LIMITS.DESCRIPTION_MAX} ký tự.`;
    if (!len(form.location)) p.location = 'Nhập địa điểm tổ chức.';
    else if (len(form.location) > LIMITS.LOCATION_MAX) p.location = `Địa điểm tối đa ${LIMITS.LOCATION_MAX} ký tự.`;
    if (!startAt) p.start = 'Chọn ngày và giờ bắt đầu.';
    else if (startAt <= now) p.start = 'Thời gian bắt đầu phải sau thời điểm hiện tại.';
    else if (cls?.yearStart && (form.startDate < cls.yearStart || (endAt || startAt).slice(0, 10) > cls.yearEnd)) {
      p.start = `Hoạt động phải nằm trong năm học (${dmy(cls.yearStart)} – ${dmy(cls.yearEnd)}).`;
    }
    if ((form.endDate || form.endTime) && !endAt) p.end = 'Chọn giờ kết thúc hoặc để trống cả ngày lẫn giờ.';
    else if (endAt && startAt && endAt <= startAt) p.end = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
    const deadlineChanged = !original || original.registrationDeadline !== deadline;
    if (!deadline) p.deadline = 'Chọn hạn đăng ký.';
    else if (deadlineChanged && deadline <= now) p.deadline = 'Hạn đăng ký phải sau thời điểm hiện tại.';
    else if (startAt && deadline > startAt) p.deadline = 'Hạn đăng ký không được sau giờ bắt đầu.';
    if (form.capacity !== '') {
      const n = Number(form.capacity);
      if (!/^\d+$/.test(form.capacity) || n < 1 || n > LIMITS.CAPACITY_MAX) p.capacity = `Chỉ tiêu là số nguyên từ 1 đến ${LIMITS.CAPACITY_MAX}, hoặc để trống.`;
      else if (original && n < original.registeredCount) p.capacity = `Đã có ${original.registeredCount} học sinh đăng ký, chỉ tiêu không được nhỏ hơn.`;
    }
    return p;
  }, [form, startAt, endAt, deadline, now, cls, original]);
  const show = (k) => (touched || saveError) && problems[k];

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(problems).length) {
      document.querySelector('.xa-form .field-error')?.scrollIntoView({ block: 'center' });
      return;
    }
    setSaving(true);
    setSaveError(null);
    const body = {
      title: form.title.trim(), description: form.description.trim(), location: form.location.trim(),
      startAt, endAt: endAt || null, registrationDeadline: deadline, capacity: form.capacity === '' ? null : Number(form.capacity),
      ...(editing ? { stamp: original.stamp } : { classId: Number(form.classId) }),
    };
    try {
      const saved = editing ? await updateActivity(eventId, body) : await createActivity(body);
      setInitial(JSON.stringify(form));
      if (editing) toast(saved.changed ? `Đã lưu thay đổi${saved.notified ? ` và báo cho ${saved.notified} phụ huynh đã đăng ký` : ''}.` : 'Không có gì thay đổi.');
      else toast(`Đã đăng hoạt động lên bảng tin lớp ${saved.className}${saved.notified ? ` và gửi thông báo tới ${saved.notified} người` : ''}.`);
      navigate(`/extracurricular/${saved.eventId}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <div className="xa-page"><div className="notice amber"><Icon name="error_outline" /><div><p>{loadError}</p><Link to="/extracurricular" className="btn btn-secondary">Về danh sách ngoại khoá</Link></div></div></div>;
  }
  if (!form) return <div className="xa-page" aria-busy="true"><p className="muted">Đang tải…</p></div>;

  const locked = editing && (!original.can.edit);
  if (!editing && !options.classes.length) {
    return (
      <div className="xa-page">
        <div className="notice"><Icon name="info" /><p>Chỉ giáo viên chủ nhiệm của một lớp (năm học chưa kết thúc) mới tạo được hoạt động ngoại khoá.</p></div>
        <Link to="/extracurricular" className="btn btn-secondary">Về danh sách ngoại khoá</Link>
      </div>
    );
  }

  const preview = {
    eventId: original?.eventId ?? 0, title: form.title.trim() || 'Tên hoạt động', location: form.location.trim(),
    startAt: startAt || `${now.slice(0, 10)}T${form.startTime || '07:00'}`, endAt: endAt || null,
    registrationDeadline: deadline || startAt || now, capacity: form.capacity && Number(form.capacity) > 0 ? Number(form.capacity) : null,
    registeredCount: original?.registeredCount ?? 0, status: 'OPEN', beforeDeadline: true, started: false, ended: false,
  };
  const back = editing ? `/extracurricular/${eventId}` : `/extracurricular${form.classId ? `?classId=${form.classId}` : ''}`;

  return (
    <div className="xa-page">
      <nav className="xa-crumb" aria-label="Breadcrumb">
        <Link to={`/extracurricular${cls ? `?classId=${cls.classId}` : ''}`}>Ngoại khoá {cls?.className ?? ''}</Link><span>/</span>
        <strong>{editing ? 'Sửa hoạt động' : 'Tạo hoạt động'}</strong>
      </nav>
      <div className="xa-head">
        <div>
          <span className="label-upper xa-kicker">Hoạt động ngoại khoá{cls ? ` · ${cls.className}` : ''}</span>
          <h1 className="headline-lg">{editing ? 'Sửa hoạt động ngoại khoá' : 'Tạo hoạt động ngoại khoá'}</h1>
          <p className="muted">Hoạt động được đăng lên bảng tin lớp; phụ huynh đăng ký cho con trước hạn đăng ký.</p>
        </div>
        {editing && dirty && <span className="xa-chip tone-amber">Chưa lưu</span>}
      </div>

      {locked && <div className="notice amber"><Icon name="lock" /><p>Hoạt động đã bắt đầu, đã huỷ hoặc năm học đã kết thúc nên không sửa được nữa.</p></div>}
      {saveError && !['MSG_ACTIVITY_TITLE', 'MSG_ACTIVITY_DESCRIPTION', 'MSG_ACTIVITY_LOCATION', 'MSG_ACTIVITY_TIME', 'MSG_ACTIVITY_CAPACITY'].includes(saveError.code) && (
        <div className="notice amber" role="alert"><Icon name="error_outline" />
          <div>
            <p>{errorText(saveError)}</p>
            {saveError.code === 'MSG_ACTIVITY_CHANGED' && (
              <button type="button" className="btn btn-secondary" onClick={() => { setForm(null); setReloadKey((k) => k + 1); }}><Icon name="refresh" size="sm" /> Tải lại</button>
            )}
          </div>
        </div>
      )}

      <div className="xa-form-grid">
        <form className="card card-outline xa-form" onSubmit={submit} noValidate>
          {!editing && options.classes.length > 1 && (
            <label className="field">
              <span className="field-label">Lớp chủ nhiệm <span className="xa-req">*</span></span>
              <select className="input" value={form.classId} onChange={(e) => set('classId', e.target.value)}>
                {options.classes.map((c) => <option key={c.classId} value={c.classId}>{c.className}</option>)}
              </select>
            </label>
          )}
          {cls && cls.hasFeed === false && <div className="notice amber"><Icon name="warning" /><p>Lớp {cls.className} chưa có bảng tin lớp nên chưa đăng được hoạt động.</p></div>}

          <label className="field">
            <span className="field-label">Tên hoạt động <span className="xa-req">*</span><span className="xa-count">{len(form.title)}/{LIMITS.TITLE_MAX}</span></span>
            <input className="input" value={form.title} disabled={locked} maxLength={LIMITS.TITLE_MAX + 20} placeholder="Nhập tên chương trình ngoại khoá…"
              onChange={(e) => set('title', e.target.value)} aria-invalid={Boolean(show('title'))} />
            {show('title') && <span className="field-error">{problems.title}</span>}
            {saveError?.code === 'MSG_ACTIVITY_TITLE' && <span className="field-error">{errorText(saveError)}</span>}
          </label>

          <label className="field">
            <span className="field-label">Mô tả chi tiết <span className="xa-req">*</span><span className="xa-count">{len(form.description)}/{LIMITS.DESCRIPTION_MAX}</span></span>
            <textarea className="input xa-textarea" rows={6} value={form.description} disabled={locked}
              placeholder="Nội dung, mục đích giáo dục, lịch trình, chi phí (nếu có) và các yêu cầu chuẩn bị…"
              onChange={(e) => set('description', e.target.value)} aria-invalid={Boolean(show('description'))} />
            <span className="field-help">Mô tả là nội dung bài đăng trên bảng tin lớp. Ghi chi phí dự kiến (nếu có) ngay trong mô tả.</span>
            {show('description') && <span className="field-error">{problems.description}</span>}
            {saveError?.code === 'MSG_ACTIVITY_DESCRIPTION' && <span className="field-error">{errorText(saveError)}</span>}
          </label>

          <fieldset className="xa-fieldset" disabled={locked}>
            <legend className="field-label">Thời gian diễn ra <span className="xa-req">*</span></legend>
            <div className="xa-row">
              <label className="field"><span className="caption muted">Ngày bắt đầu</span>
                <input type="date" className="input" value={form.startDate} min={now.slice(0, 10)} max={cls?.yearEnd}
                  onChange={(e) => set('startDate', e.target.value)} aria-invalid={Boolean(show('start'))} /></label>
              <label className="field"><span className="caption muted">Giờ bắt đầu</span>
                <input type="time" className="input" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} /></label>
              <label className="field"><span className="caption muted">Ngày kết thúc (tuỳ chọn)</span>
                <input type="date" className="input" value={form.endDate} min={form.startDate || now.slice(0, 10)} max={cls?.yearEnd}
                  onChange={(e) => set('endDate', e.target.value)} aria-invalid={Boolean(show('end'))} /></label>
              <label className="field"><span className="caption muted">Giờ kết thúc</span>
                <input type="time" className="input" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} /></label>
            </div>
            <span className="field-help">Để trống ngày kết thúc nếu hoạt động kết thúc trong ngày bắt đầu; để trống cả hai nếu chưa rõ giờ kết thúc.</span>
            {show('start') && <span className="field-error">{problems.start}</span>}
            {show('end') && <span className="field-error">{problems.end}</span>}
            {saveError?.code === 'MSG_ACTIVITY_TIME' && <span className="field-error">{errorText(saveError)}</span>}
          </fieldset>

          <label className="field">
            <span className="field-label">Địa điểm tổ chức <span className="xa-req">*</span></span>
            <input className="input" value={form.location} disabled={locked} placeholder="Địa chỉ cụ thể" onChange={(e) => set('location', e.target.value)} aria-invalid={Boolean(show('location'))} />
            {show('location') && <span className="field-error">{problems.location}</span>}
            {saveError?.code === 'MSG_ACTIVITY_LOCATION' && <span className="field-error">{errorText(saveError)}</span>}
          </label>

          <div className="xa-row xa-row-2">
            <fieldset className="xa-fieldset" disabled={locked}>
              <legend className="field-label">Hạn đăng ký <span className="xa-req">*</span><span className="caption muted xa-legend-note">Đóng cổng tự động</span></legend>
              <div className="xa-row xa-row-2">
                <input type="date" className="input" aria-label="Ngày hết hạn đăng ký" value={form.deadlineDate} max={form.startDate || cls?.yearEnd}
                  onChange={(e) => set('deadlineDate', e.target.value)} aria-invalid={Boolean(show('deadline'))} />
                <input type="time" className="input" aria-label="Giờ hết hạn đăng ký" value={form.deadlineTime} onChange={(e) => set('deadlineTime', e.target.value)} />
              </div>
              {show('deadline') && <span className="field-error">{problems.deadline}</span>}
            </fieldset>
            <label className="field">
              <span className="field-label">Số lượng học sinh tối đa <span className="caption muted xa-legend-note">{cls?.classSize !== undefined ? `Sĩ số lớp: ${cls.classSize}` : ''}</span></span>
              <input className="input" inputMode="numeric" value={form.capacity} disabled={locked} placeholder="Để trống nếu không giới hạn"
                onChange={(e) => set('capacity', e.target.value.replace(/[^\d]/g, ''))} aria-invalid={Boolean(show('capacity'))} />
              {show('capacity') && <span className="field-error">{problems.capacity}</span>}
              {saveError?.code === 'MSG_ACTIVITY_CAPACITY' && <span className="field-error">{errorText(saveError)}</span>}
            </label>
          </div>

          <div className="notice ink">
            <Icon name="info" />
            <div>
              <p className="notice-title">Thông báo tự động</p>
              <p>
                {editing
                  ? 'Khi đổi thời gian, địa điểm hoặc hạn đăng ký, phụ huynh của các học sinh đã đăng ký sẽ nhận thông báo. Khi đã có người đăng ký, chỉ tiêu không được nhỏ hơn số đã đăng ký.'
                  : `Hoạt động được đăng lên bảng tin lớp ${cls?.className ?? ''} và gửi thông báo tới ${cls?.parentCount ?? 0} phụ huynh cùng học sinh của lớp. Phụ huynh chưa đăng ký nhận thêm nhắc trước hạn 1 ngày.`}
              </p>
            </div>
          </div>

          <div className="xa-actions">
            <Link to={back} className="btn btn-secondary">Huỷ</Link>
            <button type="submit" className="btn btn-primary" disabled={saving || locked || (editing && !dirty) || cls?.hasFeed === false}>
              <Icon name="publish" size="sm" /> {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Đăng hoạt động'}
            </button>
          </div>
        </form>

        <aside className="xa-preview">
          <span className="label-upper"><Icon name="visibility" size="sm" /> Xem trước trên bảng tin {cls?.className ?? ''}</span>
          <p className="caption muted">Như phụ huynh và học sinh sẽ thấy trên bảng tin lớp.</p>
          <div className="card card-outline xa-preview-card">
            <p className="xa-reading xa-preview-text">{form.description.trim() || 'Mô tả hoạt động…'}</p>
            <ActivityFeedCard activity={preview} />
          </div>
          {editing && <p className="caption muted">Đã đăng ký: {original.registeredCount} học sinh · hạn hiện tại {at(original.registrationDeadline)}</p>}
        </aside>
      </div>

      {leaveTo && <LeaveDialog onStay={() => setLeaveTo(null)} onLeave={() => { const to = leaveTo; setLeaveTo(null); setInitial(JSON.stringify(form)); navigate(to); }} />}
    </div>
  );
}
