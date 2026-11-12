import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  createSchoolEvent, deleteSchoolEvent, getSchoolEvent, getSchoolEventOptions, getSchoolEventPage, updateSchoolEvent,
} from '../../api/schoolEvents.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { dmy, longDate, timeRange } from './calendarUtils.js';
import './schoolCalendar.css';

// FE-10 school calendar ("Lịch của trường", Dung, 13/11/2026). Everyone reads (students / parents: whole school +
// their grades); the School Manager adds, edits and deletes any date (past ones too, to correct the record). Shown on the school feed
// ("Lịch sắp tới của trường") and in the class calendar. ?tab=past, ?page=, ?event=<id> opens one, ?new=1 the form.

const PAGE_SIZE = 10;
const len = (v) => [...(v ?? '')].length;

function EventDialog({ eventId, canManage, onClose, onEdit, onDelete }) {
  const [ev, setEv] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getSchoolEvent(eventId).then(setEv).catch((err) => setError(errorText(err)));
  }, [eventId]);
  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="sc-dialog" role="dialog" aria-modal="true" aria-labelledby="sc-ev-title" onClick={(e) => e.stopPropagation()}>
        {error ? <p role="alert">{error}</p> : !ev ? <p className="muted">Đang tải…</p> : (
          <>
            <div>
              <span className="label-upper">Lịch của trường · {ev.audience}</span>
              <h2 id="sc-ev-title">{ev.title}</h2>
            </div>
            <dl className="sc-facts">
              <div><dt>Ngày</dt><dd>{longDate(ev.startAt.slice(0, 10))}{ev.endAt && ev.endAt.slice(0, 10) !== ev.startAt.slice(0, 10) ? ` – ${longDate(ev.endAt.slice(0, 10))}` : ''}</dd></div>
              <div><dt>Giờ</dt><dd>{timeRange(ev)}</dd></div>
              {ev.location && <div><dt>Địa điểm</dt><dd>{ev.location}</dd></div>}
              <div><dt>Dành cho</dt><dd>{ev.audience}</dd></div>
              {ev.description && <div><dt>Ghi chú</dt><dd>{ev.description}</dd></div>}
              <div><dt>Người đăng</dt><dd>{ev.createdByName}</dd></div>
            </dl>
            {ev.started && <p className="caption muted">{ev.ended ? 'Sự kiện đã diễn ra.' : 'Sự kiện đang diễn ra.'}</p>}
          </>
        )}
        <div className="sc-actions">
          {canManage && ev?.can.delete && <button type="button" className="btn btn-secondary" onClick={() => onDelete(ev)}><Icon name="delete" size="sm" /> Xoá</button>}
          {canManage && ev?.can.edit && <button type="button" className="btn btn-secondary" onClick={() => onEdit(ev)}><Icon name="edit" size="sm" /> Sửa</button>}
          <button type="button" className="btn btn-primary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

function FormDialog({ options, original, onClose, onSaved, onReload }) {
  const toast = useToast();
  const L = options.limits;
  const init = original
    ? {
        title: original.title, gradeLevelId: original.gradeLevelId ? String(original.gradeLevelId) : '', location: original.location ?? '',
        description: original.description ?? '', startDate: original.startAt.slice(0, 10), startTime: original.startAt.slice(11, 16),
        endDate: original.endAt ? original.endAt.slice(0, 10) : '', endTime: original.endAt ? original.endAt.slice(11, 16) : '',
      }
    : { title: '', gradeLevelId: '', location: '', description: '', startDate: '', startTime: '07:30', endDate: '', endTime: '' };
  const [form, setForm] = useState(init);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [askClose, setAskClose] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(init);

  const startAt = form.startDate && form.startTime ? `${form.startDate}T${form.startTime}` : '';
  const endAt = form.endTime ? `${form.endDate || form.startDate}T${form.endTime}` : '';
  const now = options.now;
  const year = options.years.find((y) => form.startDate >= y.startDate && form.startDate <= y.endDate);
  const p = {};
  if (!form.title.trim()) p.title = 'Vui lòng nhập tên sự kiện.';
  else if (len(form.title.trim()) > L.TITLE_MAX) p.title = `Tên sự kiện tối đa ${L.TITLE_MAX} ký tự.`;
  if (len(form.location.trim()) > L.LOCATION_MAX) p.location = `Địa điểm tối đa ${L.LOCATION_MAX} ký tự.`;
  if (len(form.description.trim()) > L.DESCRIPTION_MAX) p.description = `Ghi chú tối đa ${L.DESCRIPTION_MAX} ký tự.`;
  if (!startAt) p.start = 'Chọn ngày và giờ bắt đầu.';
  else if ((!original || (!original.started && original.startAt !== startAt)) && startAt <= now) p.start = 'Thời gian bắt đầu phải sau thời điểm hiện tại.';
  else if (!year) p.start = 'Ngày này không thuộc năm học đang mở.';
  if (form.endDate && !form.endTime) p.end = 'Chọn giờ kết thúc (hoặc xoá ngày kết thúc).';
  else if (endAt && startAt && endAt <= startAt) p.end = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
  else if (endAt && year && endAt.slice(0, 10) > year.endDate) p.end = `Sự kiện phải kết thúc trước ${dmy(year.endDate)} (hết năm học).`;
  const ok = Object.keys(p).length === 0;

  async function submit(e) {
    e.preventDefault();
    setTried(true);
    if (!ok) return;
    setSaving(true);
    setSaveError(null);
    const body = {
      title: form.title.trim(), gradeLevelId: form.gradeLevelId || null, location: form.location.trim() || null,
      description: form.description.trim() || null, startAt, endAt: endAt || null,
    };
    try {
      const saved = original ? await updateSchoolEvent(original.eventId, { ...body, stamp: original.stamp }) : await createSchoolEvent(body);
      toast(original ? (saved.changed ? 'Đã lưu thay đổi.' : 'Không có gì thay đổi.') : 'Đã thêm vào lịch của trường.');
      onSaved(saved);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }
  const show = (k) => (tried || k === 'start' || k === 'end') && p[k];
  const close = () => (dirty && !askClose ? setAskClose(true) : onClose());

  return (
    <div className="sc-overlay" onClick={close}>
      <form className="sc-dialog" role="dialog" aria-modal="true" aria-labelledby="sc-form-title" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div>
          <span className="label-upper">Lịch của trường</span>
          <h2 id="sc-form-title">{original ? 'Sửa sự kiện' : 'Thêm sự kiện'}</h2>
        </div>
        {original?.started && <p className="caption muted">Sự kiện {original.ended ? 'đã diễn ra' : 'đang diễn ra'}: sửa để cập nhật lại thông tin cho đúng.</p>}
        <label className="field">
          <span className="field-label">Tên sự kiện *</span>
          <input className="input" value={form.title} maxLength={L.TITLE_MAX + 20} onChange={(e) => set('title', e.target.value)} placeholder="Ví dụ: Thi khảo sát Toán & Ngữ văn" />
          {show('title') && <span className="field-error">{p.title}</span>}
        </label>
        <label className="field">
          <span className="field-label">Dành cho</span>
          <select className="input" value={form.gradeLevelId} onChange={(e) => set('gradeLevelId', e.target.value)}>
            <option value="">Toàn trường</option>
            {options.grades.map((g) => <option key={g.gradeLevelId} value={g.gradeLevelId}>Khối {g.name}</option>)}
          </select>
          <span className="field-help">Học sinh và phụ huynh chỉ thấy sự kiện toàn trường và sự kiện của khối mình.</span>
        </label>
        <div className="sc-row">
          <label className="field"><span className="field-label">Ngày bắt đầu *</span>
            <input type="date" className="input" value={form.startDate} min={original?.started ? undefined : now.slice(0, 10)} onChange={(e) => set('startDate', e.target.value)} /></label>
          <label className="field"><span className="field-label">Giờ bắt đầu *</span>
            <input type="time" className="input" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} /></label>
        </div>
        {(tried || form.startDate) && p.start && <span className="field-error">{p.start}</span>}
        <div className="sc-row">
          <label className="field"><span className="field-label">Ngày kết thúc</span>
            <input type="date" className="input" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)} />
            <span className="field-help">Để trống nếu kết thúc trong ngày.</span></label>
          <label className="field"><span className="field-label">Giờ kết thúc</span>
            <input type="time" className="input" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} /></label>
        </div>
        {show('end') && <span className="field-error">{p.end}</span>}
        <label className="field">
          <span className="field-label">Địa điểm</span>
          <input className="input" value={form.location} maxLength={L.LOCATION_MAX + 20} onChange={(e) => set('location', e.target.value)} placeholder="Ví dụ: Hội trường lớn tầng 2" />
          {show('location') && <span className="field-error">{p.location}</span>}
        </label>
        <label className="field">
          <span className="field-label">Ghi chú</span>
          <textarea className="input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          {show('description') && <span className="field-error">{p.description}</span>}
        </label>
        {saveError && (
          <div className="notice amber" role="alert"><Icon name="error_outline" />
            <div>
              <p>{errorText(saveError)}</p>
              {saveError.code === 'MSG_SCHOOL_EVENT_CHANGED' && <button type="button" className="btn btn-secondary" onClick={onReload}><Icon name="refresh" size="sm" /> Tải lại</button>}
            </div>
          </div>
        )}
        {askClose && <p className="caption sc-warn" role="alert">Bạn có thay đổi chưa lưu. Bấm “Bỏ thay đổi” để đóng, hoặc tiếp tục sửa.</p>}
        <div className="sc-actions">
          <button type="button" className="btn btn-secondary" onClick={close} disabled={saving}>{askClose ? 'Bỏ thay đổi' : 'Huỷ'}</button>
          <button type="submit" className="btn btn-primary" disabled={saving || (original && !dirty)}>{saving ? 'Đang lưu…' : original ? 'Lưu thay đổi' : 'Thêm vào lịch'}</button>
        </div>
      </form>
    </div>
  );
}

export default function SchoolEventsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'past' ? 'past' : 'upcoming';
  const page = /^\d{1,4}$/.test(params.get('page') ?? '') && Number(params.get('page')) > 0 ? Number(params.get('page')) : 1;
  const openId = /^\d+$/.test(params.get('event') ?? '') ? params.get('event') : null;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [options, setOptions] = useState(null);
  const [editing, setEditing] = useState(null); // {} new, event = edit
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const setParam = (patch) => setParams((cur) => {
    const n = new URLSearchParams(cur);
    for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
    return n;
  }, { replace: true });

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await getSchoolEventPage(tab, page, PAGE_SIZE));
    } catch (err) {
      setError(errorText(err));
    }
  }, [tab, page]);
  useEffect(() => { load(); }, [load]);

  const canManage = Boolean(data?.canManage);
  useEffect(() => {
    if (canManage && !options) getSchoolEventOptions().then(setOptions).catch((err) => toast(errorText(err), { type: 'error' }));
  }, [canManage, options, toast]);
  // ?new=1 (from the school feed "Thêm") opens the form once the options are in.
  useEffect(() => {
    if (params.get('new') === '1' && options) { setEditing({}); setParam({ new: '' }); }
  }, [params, options]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = async (ev) => {
    setParam({ event: '' });
    try { setEditing(ev.stamp ? ev : await getSchoolEvent(ev.eventId)); } catch (err) { toast(errorText(err), { type: 'error' }); }
  };

  async function confirmDelete() {
    setBusy(true);
    try {
      await deleteSchoolEvent(removing.eventId);
      toast('Đã xoá sự kiện khỏi lịch của trường.');
      setRemoving(null);
      load();
    } catch (err) {
      toast(errorText(err), { type: 'error' });
      setRemoving(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sc-page">
      <nav className="sc-crumb" aria-label="Breadcrumb"><Link to="/school-feed">Bảng tin trường</Link><span>/</span><strong>Lịch của trường</strong></nav>
      <div className="sc-head">
        <div>
          <h1 className="headline-lg">Lịch của trường</h1>
          <p>Các mốc chung của nhà trường: thi, lễ, họp, ngày hội. {canManage ? 'Ban giám hiệu thêm, sửa, xoá sự kiện; sự kiện của khối hiện cả trong lịch lớp.' : 'Sự kiện của khối hiện cả trong lịch lớp.'}</p>
        </div>
        {canManage && <button type="button" className="btn btn-primary" onClick={() => setEditing({})} disabled={!options}><Icon name="add" size="sm" /> Thêm sự kiện</button>}
      </div>
      <div className="sc-tabs" role="tablist" aria-label="Thời gian">
        <button type="button" role="tab" aria-selected={tab === 'upcoming'} onClick={() => setParam({ tab: '', page: '' })}>Sắp tới{tab === 'upcoming' && data ? ` (${data.total})` : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'past'} onClick={() => setParam({ tab: 'past', page: '' })}>Đã qua{tab === 'past' && data ? ` (${data.total})` : ''}</button>
      </div>

      {error && <div className="notice amber" role="alert"><Icon name="error_outline" /><div><p>{error}</p><button type="button" className="btn btn-secondary" onClick={load}>Thử lại</button></div></div>}
      {!data && !error && <p className="muted" aria-busy="true">Đang tải…</p>}
      {data && data.events.length === 0 && (
        <div className="sc-empty"><Icon name="event_available" /><p>{tab === 'past' ? 'Chưa có sự kiện nào đã qua.' : 'Chưa có lịch sắp tới.'}</p></div>
      )}
      {data && data.events.length > 0 && (
        <ul className="sc-list">
          {data.events.map((ev) => (
            <li key={ev.eventId} className={`sc-item${ev.ended ? ' is-past' : ''}`}>
              <span className="sc-date"><strong>{ev.startAt.slice(8, 10)}</strong><span>TH{ev.startAt.slice(5, 7)}</span></span>
              <div className="sc-item-main">
                <h2><button type="button" className="sc-title-btn" onClick={() => setParam({ event: String(ev.eventId) })}>{ev.title}</button></h2>
                <div className="sc-meta">
                  <span><Icon name="schedule" size="sm" />{timeRange(ev)}{ev.endAt && ev.endAt.slice(0, 10) !== ev.startAt.slice(0, 10) ? '' : ` · ${dmy(ev.startAt.slice(0, 10))}`}</span>
                  {ev.location && <span><Icon name="location_on" size="sm" />{ev.location}</span>}
                  <span className={`sc-chip${ev.gradeLevelId ? ' is-grade' : ''}`}>{ev.audience}</span>
                  {ev.started && !ev.ended && <span className="sc-chip is-now">Đang diễn ra</span>}
                </div>
              </div>
              {canManage && (
                <div className="sc-item-actions">
                  <button type="button" className="btn btn-secondary sc-act" aria-label={`Sửa ${ev.title}`} onClick={() => startEdit(ev)} disabled={!options}><Icon name="edit" size="sm" /> Sửa</button>
                  <button type="button" className="btn sc-act sc-act-danger" aria-label={`Xoá ${ev.title}`} onClick={() => setRemoving(ev)}><Icon name="delete" size="sm" /> Xoá</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && data.pages > 1 && (
        <nav className="sc-pager" aria-label="Phân trang">
          <span className="caption muted">{(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} trong {data.total} sự kiện</span>
          <button type="button" className="btn btn-icon" aria-label="Trang trước" disabled={data.page <= 1} onClick={() => setParam({ page: data.page - 1 > 1 ? String(data.page - 1) : '' })}><Icon name="chevron_left" /></button>
          {Array.from({ length: data.pages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === data.pages || Math.abs(n - data.page) <= 1)
            .map((n, i, arr) => (
              <span key={n} className="sc-pager-item">
                {i > 0 && n - arr[i - 1] > 1 && <span className="muted">…</span>}
                <button type="button" className={`sc-pg${n === data.page ? ' is-on' : ''}`} aria-current={n === data.page ? 'page' : undefined}
                  onClick={() => setParam({ page: n > 1 ? String(n) : '' })}>{n}</button>
              </span>
            ))}
          <button type="button" className="btn btn-icon" aria-label="Trang sau" disabled={data.page >= data.pages} onClick={() => setParam({ page: String(data.page + 1) })}><Icon name="chevron_right" /></button>
        </nav>
      )}

      {openId && (
        <EventDialog eventId={openId} canManage={canManage} onClose={() => setParam({ event: '' })}
          onEdit={startEdit} onDelete={(ev) => { setParam({ event: '' }); setRemoving(ev); }} />
      )}
      {editing && options && (
        <FormDialog key={editing.stamp ?? 'new'} options={options} original={editing.eventId ? editing : null} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} onReload={() => { setEditing(null); startEdit({ eventId: editing.eventId }); load(); }} />
      )}
      {removing && (
        <div className="sc-overlay" onClick={() => !busy && setRemoving(null)}>
          <div className="sc-dialog sc-dialog-sm" role="alertdialog" aria-modal="true" aria-labelledby="sc-del-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="sc-del-title">Xoá sự kiện?</h2>
            <p>“{removing.title}” ({timeRange(removing)} {dmy(removing.startAt.slice(0, 10))}) sẽ không còn hiện trên bảng tin trường, trang này và lịch lớp.</p>
            <div className="sc-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setRemoving(null)} disabled={busy}>Huỷ</button>
              <button type="button" className="btn sc-danger" onClick={confirmDelete} disabled={busy}>{busy ? 'Đang xoá…' : 'Xoá sự kiện'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
