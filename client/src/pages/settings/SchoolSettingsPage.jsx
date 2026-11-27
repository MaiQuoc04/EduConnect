import { useCallback, useEffect, useState } from 'react';
import { getSchoolSettings, getSchoolSettingsImpact, saveSchoolSettings } from '../../api/schoolSettings.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import '../timetable/timetable.css';
import './schoolSettings.css';

// "Cài đặt hệ thống" of the School Manager (Dung, 21/11/2026). Groups:
//   Giới hạn số tiết – school-wide limits (26/11/2026, replace the teacher norms): periods a teacher teaches at most in
//               a week, periods a class has at most in a day and in a week. Checked by automatic scheduling, every
//               class timetable save (editor, Excel import) and the teaching assignment (SCR-19);
//               27/11/2026 (Khanh, FE-04): also the most periods of one subject a week (class types, SCR-70);
//   Sĩ số lớp – class size (Khanh, FE-04, 27/11/2026): above the recommended size a student is added only after a
//               confirmation, the hard cap is never passed (create class / add students, import, transfer, promotion);
//   Điểm danh – the time until which a subject teacher can edit the attendance of the day (moved from the System Admin
//               settings 24/11/2026; business rules §12).
// The System Admin has its own settings page (/admin/settings, UC-102); these values are the school's.
// SCR-86, UC-133. Table: patch_v0.3_school_settings.sql (run 21/11/2026).
// Lowering the hard cap or a period limit first lists what is already above the new value (it is kept, only adding
// more is refused) and asks for a confirmation.

const SECTIONS = [
  {
    group: 'teaching',
    title: 'Giới hạn số tiết',
    intro: 'Áp dụng cho toàn trường khi phân công giảng dạy, xếp tự động và lưu thời khoá biểu.',
    fields: [
      { key: 'teacherMaxWeek', label: 'Số tiết giáo viên dạy tối đa một tuần', unit: 'tiết/tuần', help: 'Dạy vượt không quá 50% định mức (17 + 8,5). Vượt mức này thì không lưu được.' },
      { key: 'classMaxDay', label: 'Số tiết lớp học tối đa một ngày', unit: 'tiết/ngày', help: 'Công văn 4567/BGDĐT-GDPT: học sinh học không quá 7 tiết/ngày, mỗi tiết 45 phút.' },
      { key: 'classMaxWeek', label: 'Số tiết lớp học tối đa một tuần', unit: 'tiết/tuần', help: 'Học tối thiểu 5 ngày, tối đa 11 buổi/tuần (Công văn 4567); không lớn hơn số tiết một ngày × 6. Tổng số tiết các môn của một loại lớp cũng không vượt số này.' },
      { key: 'subjectMaxWeek', label: 'Số tiết tối đa của một môn một tuần', unit: 'tiết/tuần', help: 'Áp dụng khi thiết lập môn của loại lớp. Một môn học tối đa 2 tiết/ngày; không lớn hơn số tiết lớp học tối đa một tuần.' },
    ],
  },
  {
    group: 'classes',
    title: 'Sĩ số lớp',
    intro: 'Áp dụng khi tạo lớp, thêm học sinh, nhập danh sách lớp, chuyển lớp và lên lớp.',
    fields: [
      { key: 'warnStudents', label: 'Sĩ số khuyến nghị', unit: 'học sinh', help: 'Vượt số này vẫn thêm được học sinh, nhưng hệ thống hỏi lại trước khi lưu.' },
      { key: 'maxStudents', label: 'Sĩ số tối đa', unit: 'học sinh', help: 'Không thêm được học sinh khi lớp đã đủ số này.' },
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
  if (!problems['teaching.classMaxDay'] && !problems['teaching.classMaxWeek'] && t.classMaxWeek > t.classMaxDay * 6) {
    problems['teaching.classMaxWeek'] = `Không lớn hơn ${t.classMaxDay * 6} (${t.classMaxDay} tiết/ngày × 6 ngày).`;
  }
  if (!problems['teaching.subjectMaxWeek'] && !problems['teaching.classMaxWeek'] && t.subjectMaxWeek > t.classMaxWeek) {
    problems['teaching.subjectMaxWeek'] = `Không lớn hơn số tiết lớp học tối đa một tuần (${t.classMaxWeek}).`;
  }
  const c = values.classes;
  if (!problems['classes.warnStudents'] && !problems['classes.maxStudents'] && c.warnStudents > c.maxStudents) {
    problems['classes.warnStudents'] = `Không lớn hơn sĩ số tối đa (${c.maxStudents}).`;
  }
  return { problems, values };
}

// The limits being lowered (the only ones that can leave existing data above them) -> query of /impact, or null.
function loweredLimits(data, values) {
  const lowered = {};
  if (values.classes.maxStudents < data.classes.maxStudents) lowered.maxStudents = values.classes.maxStudents;
  if (values.teaching.subjectMaxWeek < data.teaching.subjectMaxWeek) lowered.subjectMaxWeek = values.teaching.subjectMaxWeek;
  if (values.teaching.classMaxWeek < data.teaching.classMaxWeek) lowered.classMaxWeek = values.teaching.classMaxWeek;
  return Object.keys(lowered).length ? lowered : null;
}

const trackText = (t) => (t.gradeLevel ? `${t.trackName} · khối ${t.gradeLevel}` : t.trackName);
const MAX_LISTED = 8;
function ListMore({ items }) {
  return (
    <ul className="ss-impact-list">
      {items.slice(0, MAX_LISTED).map((text) => <li key={text}>{text}</li>)}
      {items.length > MAX_LISTED && <li className="muted">… và {items.length - MAX_LISTED} mục khác</li>}
    </ul>
  );
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
  const [impact, setImpact] = useState(null); // what is above the lowered limits, waiting for a confirmation

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
    e?.preventDefault();
    if (!valid || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Lowering the hard cap or a period limit: show what is already above it before saving (FE-04).
      const lowered = !impact && loweredLimits(data, values);
      if (lowered) {
        const found = await getSchoolSettingsImpact(lowered);
        if (found.classes.length || found.subjects.length || found.tracks.length) {
          setImpact(found);
          return;
        }
      }
      const d = await saveSchoolSettings({ ...values, stamp: data.stamp });
      setData(d);
      setForm(toText(d));
      setImpact(null);
      toast('Đã lưu cài đặt hệ thống.');
    } catch (err) {
      setSaveError(err);
      setImpact(null);
    } finally {
      setSaving(false);
    }
  }

  const edit = (id, value) => {
    setForm({ ...form, [id]: value });
    setImpact(null); // the list was for the values shown when it was asked
  };

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
                        ? <input className="input" type="time" min={l.min} max={l.max} value={form[id]} aria-invalid={Boolean(problems[id])} onChange={(e) => edit(id, e.target.value)} />
                        : <input className="input" type="number" inputMode="numeric" min={l.min} max={l.max} value={form[id]} aria-invalid={Boolean(problems[id])} onChange={(e) => edit(id, e.target.value)} />}
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

        {impact && (
          <div className="confirm-box amber ss-impact" role="alertdialog" aria-labelledby="ss-impact-title">
            <div className="confirm-head">
              <Icon name="warning" />
              <div>
                <p id="ss-impact-title"><strong>Một số dữ liệu đang vượt giới hạn mới.</strong> Dữ liệu cũ được giữ nguyên; chỉ không thêm được học sinh hoặc số tiết vượt giới hạn.</p>
                {impact.classes.length > 0 && (
                  <>
                    <p>{impact.classes.length} lớp có nhiều hơn {values.classes.maxStudents} học sinh:</p>
                    <ListMore items={impact.classes.map((c) => `${c.className} (${c.students} học sinh, năm học ${c.yearName})`)} />
                  </>
                )}
                {impact.subjects.length > 0 && (
                  <>
                    <p>{impact.subjects.length} môn có nhiều hơn {values.teaching.subjectMaxWeek} tiết mỗi tuần:</p>
                    <ListMore items={impact.subjects.map((x) => `${x.subjectName} – ${trackText(x)} (${x.periods} tiết, năm học ${x.yearName})`)} />
                  </>
                )}
                {impact.tracks.length > 0 && (
                  <>
                    <p>{impact.tracks.length} loại lớp có tổng nhiều hơn {values.teaching.classMaxWeek} tiết mỗi tuần:</p>
                    <ListMore items={impact.tracks.map((x) => `${trackText(x)} (${x.total} tiết, năm học ${x.yearName})`)} />
                  </>
                )}
              </div>
            </div>
            <div className="card-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setImpact(null)} disabled={saving}>Huỷ</button>
              <button type="button" className="btn btn-primary" onClick={() => save()} disabled={saving}>{saving ? 'Đang lưu…' : 'Vẫn lưu cài đặt'}</button>
            </div>
          </div>
        )}

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
          <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => { setForm(toText(data)); setSaveError(null); setImpact(null); }}>Đặt lại</button>
          <button type="submit" className="btn btn-primary" disabled={!dirty || !valid || saving || !data.ready || Boolean(impact)}>
            <Icon name="save" size="sm" /> {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
          </button>
        </div>
      </form>
    </div>
  );
}
