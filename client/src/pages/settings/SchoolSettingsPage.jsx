import { useCallback, useEffect, useState } from 'react';
import { getSchoolSettings, saveSchoolSettings } from '../../api/schoolSettings.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import '../timetable/timetable.css';
import './schoolSettings.css';

// "Cài đặt hệ thống" of the School Manager (Dung, 21/11/2026). Groups:
//   Giáo viên – the teaching load used by automatic scheduling (moved from part "4. Giáo viên" of SCR-80);
//   Điểm danh – the time until which a subject teacher can edit the attendance of the day (moved from the System Admin
//               settings 24/11/2026; business rules §12).
// The System Admin has its own settings page (/admin/settings, UC-102); these values are the school's.
// ASSUMPTION: no UC / SCR id yet (to be given by the team lead). Table: patch_v0.3_school_settings.sql (run 21/11/2026).

const SECTIONS = [
  {
    group: 'teaching',
    title: 'Giáo viên',
    intro: 'Định mức giảng dạy dùng khi xếp tự động phân công và thời khoá biểu.',
    fields: [
      { key: 'norm', label: 'Định mức giáo viên', unit: 'tiết/tuần', help: 'Số tiết một giáo viên dạy trong tuần (Thông tư 05/2025: 17 tiết với giáo viên THPT).' },
      { key: 'homeroomNorm', label: 'Định mức giáo viên chủ nhiệm', unit: 'tiết/tuần', help: 'Giáo viên chủ nhiệm được giảm tiết; không lớn hơn định mức giáo viên.' },
      { key: 'maxOver', label: 'Vượt định mức tối đa', unit: 'tiết/tuần', help: 'Xếp tự động không phân công quá định mức cộng số tiết này.' },
      { key: 'maxPerDay', label: 'Số tiết tối đa một ngày', unit: 'tiết/ngày', help: 'Xếp tự động hạn chế xếp cho một giáo viên quá số tiết này trong một ngày.' },
    ],
  },
  {
    group: 'attendance',
    title: 'Điểm danh',
    intro: 'Thời hạn giáo viên bộ môn được sửa điểm danh các tiết mình dạy.',
    fields: [
      { key: 'editDeadlineTime', type: 'time', label: 'Giờ cuối giáo viên bộ môn được sửa điểm danh trong ngày', unit: 'cùng ngày', help: 'Giáo viên bộ môn sửa được điểm danh của tiết mình dạy đến giờ này trong chính ngày học.' },
    ],
  },
];
const FIELDS = SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, group: s.group, id: `${s.group}.${f.key}` })));

const toText = (d) => Object.fromEntries(FIELDS.map((f) => [f.id, String(d[f.group][f.key])]));

function check(form, limits) {
  const problems = {};
  const values = Object.fromEntries(SECTIONS.map((s) => [s.group, {}]));
  for (const f of FIELDS) {
    const v = form[f.id].trim();
    const l = limits[f.group][f.key];
    if (!v) problems[f.id] = 'Vui lòng nhập giá trị.';
    else if (f.type === 'time') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v) || v < l.min || v > l.max) problems[f.id] = `Chọn giờ từ ${l.min} đến ${l.max}.`;
      else values[f.group][f.key] = v;
    } else if (!/^\d{1,3}$/.test(v) || Number(v) < l.min || Number(v) > l.max) problems[f.id] = `Nhập số nguyên từ ${l.min} đến ${l.max}.`;
    else values[f.group][f.key] = Number(v);
  }
  const t = values.teaching;
  if (!problems['teaching.norm'] && !problems['teaching.homeroomNorm'] && t.homeroomNorm > t.norm) problems['teaching.homeroomNorm'] = 'Không được lớn hơn định mức giáo viên.';
  return { problems, values };
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
      setForm(toText(d));
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = Boolean(data && form && FIELDS.some((f) => form[f.id].trim() !== String(data[f.group][f.key])));
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
      const d = await saveSchoolSettings({ ...values, stamp: data.stamp });
      setData(d);
      setForm(toText(d));
      toast('Đã lưu cài đặt hệ thống.');
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
          <p>Các thông số chung của nhà trường.</p>
        </div>
        {data.updatedAt && (
          <div className="ss-updated">
            <span className="label-upper">Cập nhật gần nhất</span>
            <span>{formatTime(data.updatedAt)}{data.updatedByName ? ` · ${data.updatedByName}` : ''}</span>
          </div>
        )}
      </div>

      {!data.ready && (
        <div className="notice amber" role="status"><Icon name="info" />
          <p>Cơ sở dữ liệu chưa có bảng cài đặt (cần chạy patch_v0.3_school_settings.sql). Đang dùng giá trị mặc định; chưa lưu được thay đổi.</p>
        </div>
      )}

      <form className="ss-form" onSubmit={save} noValidate>
        {SECTIONS.map((s) => (
          <section key={s.group} className="card card-outline ss-card" aria-labelledby={`ss-${s.group}`}>
            <header className="ss-card-head">
              <div>
                <h2 className="title-sm" id={`ss-${s.group}`}>{s.title}</h2>
                <p className="caption muted">{s.intro}</p>
              </div>
            </header>
            <div className="ss-grid">
              {s.fields.map((f) => {
                const id = `${s.group}.${f.key}`;
                const l = data.limits[s.group][f.key];
                return (
                  <label key={id} className="field">
                    <span className="field-label">{f.label}</span>
                    <div className="ss-input">
                      {f.type === 'time'
                        ? <input className="input" type="time" min={l.min} max={l.max} value={form[id]} aria-invalid={Boolean(problems[id])} onChange={(e) => setForm({ ...form, [id]: e.target.value })} />
                        : <input className="input" type="number" inputMode="numeric" min={l.min} max={l.max} value={form[id]} aria-invalid={Boolean(problems[id])} onChange={(e) => setForm({ ...form, [id]: e.target.value })} />}
                      <span className="ss-unit">{f.unit}</span>
                    </div>
                    <span className="field-help">{f.help} Từ {l.min} đến {l.max}; mặc định {l.default}.</span>
                    {problems[id] && <span className="field-error">{problems[id]}</span>}
                  </label>
                );
              })}
            </div>
          </section>
        ))}

        {saveError && (
          <div className="notice amber" role="alert"><Icon name="error_outline" />
            <div>
              <p>{errorText(saveError)}</p>
              {saveError.code === 'MSG_SCHOOL_SETTINGS_CHANGED' && <button type="button" className="btn btn-secondary" onClick={load}><Icon name="refresh" size="sm" /> Tải lại</button>}
            </div>
          </div>
        )}

        <div className="ss-actions card card-outline">
          <span className="caption muted">{dirty ? 'Có thay đổi chưa lưu' : 'Chưa có thay đổi'}</span>
          <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => { setForm(toText(data)); setSaveError(null); }}>Đặt lại</button>
          <button type="submit" className="btn btn-primary" disabled={!dirty || !valid || saving || !data.ready}>
            <Icon name="save" size="sm" /> {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
          </button>
        </div>
      </form>
    </div>
  );
}
