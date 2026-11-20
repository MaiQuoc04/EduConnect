import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSchoolSettings, saveSchoolSettings } from '../../api/schoolSettings.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import '../timetable/timetable.css';
import './schoolSettings.css';

// "Cài đặt hệ thống" of the School Manager (Dung, 21/11/2026). First group: the teaching load used by automatic
// scheduling, moved here from part "4. Giáo viên" of the automatic scheduling screen. The System Admin has its own
// settings page (/admin/settings, UC-102); these values are the school's, not the system's.
// ASSUMPTION: proposed screen, no UC / SCR id yet (waiting for the team lead).

const FIELDS = [
  { key: 'norm', label: 'Định mức giáo viên', unit: 'tiết/tuần', help: 'Số tiết một giáo viên dạy trong tuần (Thông tư 05/2025: 17 tiết với giáo viên THPT).' },
  { key: 'homeroomNorm', label: 'Định mức giáo viên chủ nhiệm', unit: 'tiết/tuần', help: 'Giáo viên chủ nhiệm được giảm tiết; không lớn hơn định mức giáo viên.' },
  { key: 'maxOver', label: 'Vượt định mức tối đa', unit: 'tiết/tuần', help: 'Xếp tự động không phân công quá định mức cộng số tiết này.' },
  { key: 'maxPerDay', label: 'Số tiết tối đa một ngày', unit: 'tiết/ngày', help: 'Xếp tự động hạn chế xếp cho một giáo viên quá số tiết này trong một ngày.' },
];

const toText = (t) => Object.fromEntries(FIELDS.map((f) => [f.key, String(t[f.key])]));

function check(form, limits) {
  const problems = {};
  const n = {};
  for (const f of FIELDS) {
    const v = form[f.key].trim();
    const l = limits[f.key];
    if (!v) problems[f.key] = 'Vui lòng nhập giá trị.';
    else if (!/^\d{1,3}$/.test(v) || Number(v) < l.min || Number(v) > l.max) problems[f.key] = `Nhập số nguyên từ ${l.min} đến ${l.max}.`;
    else n[f.key] = Number(v);
  }
  if (!problems.norm && !problems.homeroomNorm && n.homeroomNorm > n.norm) problems.homeroomNorm = 'Không được lớn hơn định mức giáo viên.';
  return { problems, values: n };
}

function formatTime(ts) {
  if (!ts) return '';
  const [d, t] = String(ts).split(/[ T]/);
  const [y, m, day] = d.split('-');
  return `${t.slice(0, 5)} · ${day}/${m}/${y}`;
}

export default function SchoolSettingsPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    setSaveError(null);
    try {
      const d = await getSchoolSettings();
      setData(d);
      setForm(toText(d.teaching));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = Boolean(data && form && FIELDS.some((f) => form[f.key].trim() !== String(data.teaching[f.key])));
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loadError) {
    return <div className="tt-page"><div className="notice amber" role="alert"><Icon name="error_outline" /><div><p>{loadError}</p><button type="button" className="btn btn-secondary" onClick={load}>Thử lại</button></div></div></div>;
  }
  if (!data || !form) return <div className="tt-page" aria-busy="true"><p className="muted">Đang tải…</p></div>;

  const { problems, values } = check(form, data.limits);
  const valid = Object.keys(problems).length === 0;

  async function save(e) {
    e.preventDefault();
    if (!valid || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const d = await saveSchoolSettings({ teaching: values, stamp: data.stamp });
      setData(d);
      setForm(toText(d.teaching));
      toast('Đã lưu cài đặt giáo viên.');
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tt-page">
      <nav className="tt-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span className="tt-crumb-sep">/</span><strong className="tt-ink">Cài đặt hệ thống</strong>
      </nav>
      <div className="tt-head">
        <div>
          <h1 className="headline-xl">Cài đặt hệ thống</h1>
          <p>Các thông số chung của nhà trường. Thay đổi áp dụng cho những lần xếp thời khoá biểu tự động sau khi lưu.</p>
        </div>
      </div>

      {!data.ready && (
        <div className="notice amber" role="status"><Icon name="info" />
          <p>Cơ sở dữ liệu chưa có bảng cài đặt (cần chạy patch_v0.3_school_settings.sql). Đang dùng giá trị mặc định; chưa lưu được thay đổi.</p>
        </div>
      )}

      <form className="card card-outline ss-card" onSubmit={save} noValidate>
        <header className="ss-card-head">
          <div>
            <h2 className="title-sm">Giáo viên</h2>
            <p className="caption muted">Định mức giảng dạy dùng khi xếp tự động phân công và thời khoá biểu.</p>
          </div>
          {data.updatedAt && (
            <div className="ss-updated">
              <span className="label-upper">Cập nhật gần nhất</span>
              <span>{formatTime(data.updatedAt)}{data.updatedByName ? ` · ${data.updatedByName}` : ''}</span>
            </div>
          )}
        </header>

        <div className="ss-grid">
          {FIELDS.map((f) => {
            const l = data.limits[f.key];
            return (
              <label key={f.key} className="field">
                <span className="field-label">{f.label}</span>
                <div className="ss-input">
                  <input className="input" type="number" inputMode="numeric" min={l.min} max={l.max} value={form[f.key]}
                    aria-invalid={Boolean(problems[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  <span className="ss-unit">{f.unit}</span>
                </div>
                <span className="field-help">{f.help} Từ {l.min} đến {l.max}; mặc định {l.default}.</span>
                {problems[f.key] && <span className="field-error">{problems[f.key]}</span>}
              </label>
            );
          })}
        </div>

        <div className="notice ink"><Icon name="info" />
          <p>Danh sách giáo viên bận vẫn chọn riêng cho từng lần xếp ở trang <Link to="/timetables/auto">Xếp tự động</Link>. Thời khoá biểu đã lưu không thay đổi khi sửa các giá trị này.</p>
        </div>

        {saveError && (
          <div className="notice amber" role="alert"><Icon name="error_outline" />
            <div>
              <p>{errorText(saveError)}</p>
              {saveError.code === 'MSG_SCHOOL_SETTINGS_CHANGED' && <button type="button" className="btn btn-secondary" onClick={load}><Icon name="refresh" size="sm" /> Tải lại</button>}
            </div>
          </div>
        )}

        <div className="ss-actions">
          <span className="caption muted">{dirty ? 'Có thay đổi chưa lưu' : 'Chưa có thay đổi'}</span>
          <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => { setForm(toText(data.teaching)); setSaveError(null); }}>Đặt lại</button>
          <button type="submit" className="btn btn-primary" disabled={!dirty || !valid || saving || !data.ready}>
            <Icon name="save" size="sm" /> {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
          </button>
        </div>
      </form>
    </div>
  );
}
