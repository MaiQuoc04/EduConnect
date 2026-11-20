import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { applyAutoSchedule, getAutoOptions, runAutoSchedule } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { dmy, WEEKDAY_LONG, WEEKDAY_SHORT } from './WeekTimetable.jsx';
import './timetable.css';

// FE-10 automatic scheduling (Dung, 17/11/2026) – School Manager. Step A: teaching assignment (one teacher per class
// and subject for the rest of the year); step B: timetable of one semester. The server makes a DRAFT; nothing is saved
// until "Áp dụng", which checks the draft again and saves it with the SCR-19 / UC-71 code. Spec: business-rules §10.

const MODES = [
  ['ALL', 'Phân công + xếp tiết'],
  ['ASSIGN', 'Chỉ phân công giảng dạy'],
  ['TIMETABLE', 'Chỉ xếp tiết (dùng phân công đang có)'],
];
const WEIGHT_LABELS = {
  S1: 'Giáo viên vượt định mức (mỗi tiết)',
  S2: 'Tiết trống lủng của giáo viên',
  S3: 'Hai tiết cùng môn trong ngày không liền nhau',
  S4: 'Giáo viên dạy quá số tiết/ngày',
  S5: 'Một môn dồn vào một ngày',
  S6: 'Môn nặng ở tiết 4–5 hoặc buổi chiều',
  S7: 'Môn ưu tiên chiều bị xếp buổi sáng',
  S8: 'Lệch tải giữa giáo viên cùng môn',
  S9: 'GVCN không dạy lớp mình',
  GAP: 'Ô trống giữa buổi của lớp',
};
const DEFAULT_WEIGHTS = { S1: 10, S2: 8, S3: 6, S4: 5, S5: 4, S6: 3, S7: 3, S8: 2, S9: 2, GAP: 20 };
const REASONS = {
  NO_TEACHER: 'chưa có giáo viên',
  CLASS_FULL: 'lớp đã kín ô',
  TEACHER_BUSY: 'giáo viên kín các ô còn trống của lớp',
  ROOM_FULL: 'hết phòng ở các ô còn trống',
  DAY_LIMIT: 'đã đủ số tiết/ngày của môn',
  FIXED_SLOT: 'ô cố định đã bị chiếm',
  NO_QUALIFIED: 'không giáo viên nào dạy được môn này',
  OVER_CAP: 'mọi giáo viên dạy được đều đã kín định mức',
  FIXED_CLASH: 'các giáo viên dạy được đều đã phụ trách môn này ở lớp khác (ô cố định trùng giờ)',
};

function checkText(e, names) {
  const sub = (id) => names.subjects[id] ?? e.subject ?? id;
  switch (e.code) {
    case 'PERIOD_MISSING': return `Danh mục tiết học chưa có tiết ${e.periods.join(', ')}. Hãy chỉnh khung tuần hoặc thêm tiết.`;
    case 'FIXED_OUTSIDE_GRID': return 'Ô cố định (Chào cờ / Sinh hoạt lớp) nằm ngoài khung tuần.';
    case 'CLASS_NO_SUBJECTS': return `Lớp ${e.className}: tổ hợp chưa có môn và số tiết cho năm học này.`;
    case 'CLASS_TOO_MANY': return `Lớp ${e.className}: cần ${e.total} tiết/tuần nhưng khung tuần chỉ có ${e.cells} ô.`;
    case 'CLASS_EMPTY_CELLS': return `Lớp ${e.className}: ${e.total} tiết cho ${e.cells} ô, còn ${e.cells - e.total} ô trống (xếp ở cuối buổi).`;
    case 'CLASS_NO_FIXED_SUBJECT': return `Lớp ${e.className} không học môn của ô cố định nên không có Chào cờ / Sinh hoạt lớp.`;
    case 'CLASS_NO_HOMEROOM': return `Lớp ${e.className} chưa có GVCN.`;
    case 'NOT_ASSIGNED': return `Còn ${e.count} cặp lớp – môn chưa có phân công đang chạy: ${e.items.map((i) => `${i.className} – ${i.subject}${i.locked ? ' (giáo viên bị khoá)' : ''}`).join('; ')}. Hãy chọn "Phân công + xếp tiết".`;
    case 'NO_QUALIFIED': return `Môn ${sub(e.subjectId)}: chưa có giáo viên nào đăng ký dạy.`;
    case 'NOT_ENOUGH_TEACHERS': return `Môn ${sub(e.subjectId)}: cần ${e.need} tiết/tuần nhưng ${e.teachers} giáo viên chỉ nhận tối đa ${e.capacity} tiết – thiếu ${e.short} tiết (khoảng ${e.teachersMore} giáo viên nữa).`;
    case 'OVER_NORM_NEEDED': return `Môn ${sub(e.subjectId)}: phải có giáo viên dạy vượt định mức.`;
    case 'FIXED_TEACHERS': return `Môn ${sub(e.subjectId)} có ô cố định cùng giờ ở ${e.classes} lớp nhưng chỉ ${e.teachers} giáo viên dạy được – mỗi lớp cần một người khác nhau.`;
    case 'ROOM_TOO_FEW': return `Môn ${sub(e.subjectId)}: ${e.need} tiết/tuần nhưng ${e.rooms} phòng × ${e.cells} ô không đủ.`;
    case 'BUSY_UNKNOWN_TEACHER': return 'Có ô bận của giáo viên không còn trong danh sách.';
    default: return e.code;
  }
}

function violationText(v, names, className) {
  const sub = names.subjects[v.subjectId] ?? '';
  const teacher = names.teachers[v.teacherId] ?? '';
  const day = v.weekday ? WEEKDAY_LONG[v.weekday - 1] : '';
  switch (v.code) {
    case 'S2': return `${teacher}: ${v.count} tiết trống giữa buổi ${day}`;
    case 'S3': return `${className(v.classId)}: ${sub} hai tiết không liền nhau ${day}`;
    case 'S4': return `${teacher}: ${v.count} tiết ${day}`;
    case 'S5': return `${className(v.classId)}: ${sub} dồn vào một ngày`;
    case 'S6': return `${className(v.classId)}: ${sub} ở tiết ${v.period} ${day}`;
    case 'S7': return `${className(v.classId)}: ${sub} buổi sáng ${day}`;
    case 'GAP': return `${className(v.classId)}: ô trống trước tiết ${v.period} ${day}`;
    default: return v.code;
  }
}

const periodsOf = (grid) => {
  const morning = Math.max(0, ...grid.map((d) => d.morning));
  const afternoon = Math.max(0, ...grid.map((d) => d.afternoon));
  return [...Array.from({ length: morning }, (_, i) => i + 1), ...Array.from({ length: afternoon }, (_, i) => 6 + i)];
};
const inGrid = (grid, w, p) => {
  const d = grid.find((x) => x.weekday === w);
  return Boolean(d) && (p <= 5 ? p <= d.morning : p - 5 <= d.afternoon);
};

function Grid({ grid, cells, fixed, empty = '' }) {
  const days = grid.map((d) => d.weekday);
  const periods = periodsOf(grid);
  return (
    <div className="ta-grid-wrap">
      <table className="ta-grid">
        <thead><tr><th scope="col">Tiết</th>{days.map((w) => <th key={w} scope="col">{WEEKDAY_LONG[w - 1]}</th>)}</tr></thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p} className={p === 6 ? 'ta-afternoon-start' : ''}>
              <th scope="row">{p <= 5 ? `S${p}` : `C${p - 5}`}</th>
              {days.map((w) => {
                if (!inGrid(grid, w, p)) return <td key={w} className="ta-off" aria-label="Không học" />;
                const c = cells.get(`${w}-${p}`);
                const f = fixed?.get(`${w}-${p}`);
                return (
                  <td key={w} className={c ? (f ? 'ta-fixed' : '') : 'ta-empty'}>
                    {c ? <><strong>{c.title}</strong><span>{f ? `${f} · ` : ''}{c.sub}</span></> : <span className="tt-faint">{empty}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TimetableAutoPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [opts, setOpts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null);
  const [result, setResult] = useState(null);
  const [ranWith, setRanWith] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [view, setView] = useState('class');
  const [pickClass, setPickClass] = useState('');
  const [pickTeacher, setPickTeacher] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [overwriteOk, setOverwriteOk] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [busyDraft, setBusyDraft] = useState({ teacherId: '', weekday: 1, period: 1 });
  const [showWeights, setShowWeights] = useState(false);

  const load = useCallback(async (schoolYearId) => {
    setLoadError('');
    try {
      const o = await getAutoOptions(schoolYearId);
      setOpts(o);
      const d = o.defaults ?? {};
      const sem = o.semesters.find((s) => s.startDate <= o.today && s.endDate >= o.today) ?? o.semesters.find((s) => s.endDate >= o.today) ?? o.semesters[0];
      setForm({
        schoolYearId: o.schoolYearId,
        semesterId: sem ? String(sem.semesterId) : '',
        classIds: [],
        mode: 'ALL',
        keepAssignments: false,
        grid: d.grid ?? [],
        periods: {},
        maxPerSubjectDay: d.maxPerSubjectDay,
        rooms: d.rooms ?? {},
        busy: [],
        heavySubjectIds: d.heavySubjectIds ?? [],
        afternoonSubjectIds: d.afternoonSubjectIds ?? [],
        fixed: d.fixed ?? null,
        weights: { ...DEFAULT_WEIGHTS },
        seed: 1,
        timeLimitSec: d.timeLimitSec ?? 5,
      });
      setResult(null);
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const config = useMemo(() => {
    if (!form) return null;
    const num = (v) => (v === '' || v == null ? undefined : Number(v));
    return {
      schoolYearId: form.schoolYearId,
      semesterId: form.semesterId,
      classIds: form.classIds,
      mode: form.mode,
      keepAssignments: form.mode === 'ALL' || form.mode === 'ASSIGN' ? form.keepAssignments : false,
      grid: form.grid.map((d) => ({ weekday: d.weekday, morning: Number(d.morning) || 0, afternoon: Number(d.afternoon) || 0 })),
      periods: Object.fromEntries(Object.entries(form.periods).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, Number(v)])),
      maxPerSubjectDay: num(form.maxPerSubjectDay),
      rooms: Object.fromEntries(Object.entries(form.rooms).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, Number(v)])),
      busy: form.busy,
      heavySubjectIds: form.heavySubjectIds,
      afternoonSubjectIds: form.afternoonSubjectIds,
      fixed: form.fixed?.subjectId ? { subjectId: form.fixed.subjectId, slots: form.fixed.slots } : null,
      weights: Object.fromEntries(Object.entries(form.weights).map(([k, v]) => [k, Number(v) || 0])),
      seed: form.seed,
      timeLimitSec: num(form.timeLimitSec),
    };
  }, [form]);
  const stale = result && JSON.stringify(config) !== ranWith;

  if (loadError) return <div className="tt-page"><div className="notice amber" role="alert"><Icon name="error_outline" /><div><p>{loadError}</p><button type="button" className="btn btn-secondary" onClick={() => load()}>Thử lại</button></div></div></div>;
  if (!opts || !form) return <div className="tt-page" aria-busy="true"><p className="muted">Đang tải…</p></div>;

  const classById = new Map(opts.classes.map((c) => [String(c.classId), c]));
  const className = (id) => classById.get(String(id))?.className ?? id;
  const teacherName = new Map(opts.teachers.map((t) => [String(t.teacherId), t.name]));
  const selected = form.classIds.map((id) => classById.get(String(id))).filter(Boolean);
  const tracks = new Set(selected.map((c) => String(c.trackId)));
  const usedSubjects = opts.subjects.filter((s) => Object.keys(s.periodsByTrack ?? {}).some((t) => tracks.has(String(t))));
  const grades = [...new Set(opts.classes.map((c) => c.gradeName))];
  const cells = form.grid.reduce((n, d) => n + (Number(d.morning) || 0) + (Number(d.afternoon) || 0), 0);
  const semester = opts.semesters.find((s) => String(s.semesterId) === String(form.semesterId));
  const names = { subjects: result?.subjectNames ?? Object.fromEntries(opts.subjects.map((s) => [s.subjectId, s.name])), teachers: result?.teacherNames ?? Object.fromEntries(teacherName) };

  const toggleClass = (id) => set('classIds', form.classIds.includes(String(id)) ? form.classIds.filter((x) => x !== String(id)) : [...form.classIds, String(id)]);
  const toggleGrade = (g) => {
    const ids = opts.classes.filter((c) => c.gradeName === g).map((c) => String(c.classId));
    const all = ids.every((id) => form.classIds.includes(id));
    set('classIds', all ? form.classIds.filter((id) => !ids.includes(id)) : [...new Set([...form.classIds, ...ids])]);
  };
  const toggleIn = (k, id) => set(k, form[k].includes(String(id)) ? form[k].filter((x) => x !== String(id)) : [...form[k], String(id)]);
  const setGrid = (w, k, v) => set('grid', form.grid.some((d) => d.weekday === w)
    ? form.grid.map((d) => (d.weekday === w ? { ...d, [k]: v } : d))
    : [...form.grid, { weekday: w, morning: 0, afternoon: 0, [k]: v }].sort((a, b) => a.weekday - b.weekday));

  async function run(seed) {
    const cfg = { ...config, seed: seed ?? config.seed };
    if (seed) set('seed', seed);
    setRunning(true);
    setRunError('');
    setApplyError(null);
    try {
      const r = await runAutoSchedule(cfg);
      setResult(r);
      setRanWith(JSON.stringify(cfg));
      setPickClass(r.timetables ? Object.keys(r.timetables)[0] ?? '' : '');
      setPickTeacher(r.loads?.[0]?.teacherId ?? '');
      setView(r.ok ? (r.timetables ? 'class' : 'assign') : 'class');
    } catch (err) {
      setRunError(errorText(err));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  async function apply() {
    setApplying(true);
    setApplyError(null);
    try {
      const r = await applyAutoSchedule({
        config: JSON.parse(ranWith),
        stamp: result.stamp,
        confirmOverwrite: overwriteOk,
        draft: { assignments: result.assignments.map(({ classId, subjectId, teacherId }) => ({ classId, subjectId, teacherId })), timetables: result.timetables ?? {} },
      });
      setConfirm(false);
      toast(`Đã áp dụng cho ${r.classes} lớp: ${r.assignmentsChanged} phân công thay đổi${r.generated ? `, tạo ${r.generated} tiết học từ ${dmy(r.range.start)} đến ${dmy(r.range.end)}` : ''}.`);
      navigate('/timetables');
    } catch (err) {
      setApplyError(err);
    } finally {
      setApplying(false);
    }
  }

  // ── result views ──
  const assignOf = new Map((result?.assignments ?? []).map((a) => [`${a.classId}:${a.subjectId}`, a]));
  const fixedLabels = new Map((ranWith ? JSON.parse(ranWith).fixed?.slots ?? [] : []).map((s) => [`${s.weekday}-${s.period}`, s.label || 'Cố định']));
  const resultGrid = ranWith ? JSON.parse(ranWith).grid : form.grid;
  const classCells = (cid) => new Map((result?.timetables?.[cid] ?? []).map((e) => [`${e.weekday}-${e.period}`, { title: names.subjects[e.subjectId], sub: names.teachers[assignOf.get(`${cid}:${e.subjectId}`)?.teacherId] ?? '' }]));
  const teacherCells = (tid) => {
    const m = new Map();
    for (const [cid, list] of Object.entries(result?.timetables ?? {})) {
      for (const e of list) if (assignOf.get(`${cid}:${e.subjectId}`)?.teacherId === String(tid)) m.set(`${e.weekday}-${e.period}`, { title: className(cid), sub: names.subjects[e.subjectId] });
    }
    return m;
  };
  const overwrite = (result?.existing ?? []).filter((c) => (form.mode !== 'ASSIGN' && c.hasTimetable) || (form.mode !== 'TIMETABLE' && c.assigned > 0
    && (result.assignments ?? []).some((a) => a.classId === String(c.classId) && a.changed)));
  const changed = (result?.assignments ?? []).filter((a) => a.changed).length;
  const overTeachers = (result?.loads ?? []).filter((l) => l.over > 0);
  const blocking = result && (!result.ok || result.unplaced.length > 0 || result.unassigned.length > 0);

  return (
    <div className="tt-page">
      <nav className="tt-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span className="tt-crumb-sep">/</span><Link to="/timetables">Thời khoá biểu</Link><span className="tt-crumb-sep">/</span><strong className="tt-ink">Xếp tự động</strong>
      </nav>
      <div className="tt-head">
        <div>
          <h1 className="headline-xl">Xếp tự động</h1>
          <p>Hệ thống phân công giáo viên và xếp tiết cho các lớp đã chọn, không bao giờ trùng giáo viên, trùng lớp hay vượt phòng. Kết quả là bản nháp: xem kỹ rồi mới áp dụng.</p>
        </div>
      </div>

      <div className="ta-layout">
        <section className="card card-outline ta-form" aria-label="Thiết lập">
          <h2 className="title-sm">1. Phạm vi</h2>
          <div className="ta-row">
            <label className="field"><span className="field-label">Năm học</span>
              <select className="input" value={form.schoolYearId} onChange={(e) => load(e.target.value)}>
                {opts.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select></label>
            <label className="field"><span className="field-label">Học kỳ</span>
              <select className="input" value={form.semesterId} onChange={(e) => set('semesterId', e.target.value)}>
                {opts.semesters.map((s) => <option key={s.semesterId} value={s.semesterId} disabled={s.endDate < opts.today}>Học kỳ {s.no} ({dmy(s.startDate)} – {dmy(s.endDate)}){s.endDate < opts.today ? ' – đã qua' : ''}</option>)}
              </select></label>
          </div>
          {semester && <p className="caption muted">Xếp từ {dmy(semester.startDate > opts.today ? semester.startDate : opts.today)} đến {dmy(semester.endDate)}. Phân công mới áp dụng tới hết năm học.</p>}
          <fieldset className="ta-fieldset">
            <legend className="field-label">Cách xếp</legend>
            {MODES.map(([k, label]) => (
              <label key={k} className="ta-radio"><input type="radio" name="mode" checked={form.mode === k} onChange={() => set('mode', k)} /> {label}</label>
            ))}
            {form.mode !== 'TIMETABLE' && (
              <label className="ta-check"><input type="checkbox" checked={form.keepAssignments} onChange={(e) => set('keepAssignments', e.target.checked)} /> Giữ phân công đang có, chỉ phân công phần còn thiếu</label>
            )}
          </fieldset>
          <div className="ta-fieldset">
            <span className="field-label">Lớp ({form.classIds.length} đã chọn)</span>
            {grades.map((g) => (
              <div key={g} className="ta-grade">
                <button type="button" className="tt-link" onClick={() => toggleGrade(g)}>Khối {g}</button>
                <div className="ta-chips">
                  {opts.classes.filter((c) => c.gradeName === g).map((c) => (
                    <label key={c.classId} className={`ta-chip${form.classIds.includes(String(c.classId)) ? ' is-on' : ''}`} title={`${c.trackName} · ${c.periodsPerWeek} tiết/tuần · GVCN ${c.homeroomName ?? 'chưa có'}`}>
                      <input type="checkbox" checked={form.classIds.includes(String(c.classId))} onChange={() => toggleClass(c.classId)} /> {c.className}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!opts.classes.length && <p className="caption muted">Năm học này chưa có lớp.</p>}
          </div>

          {form.mode !== 'ASSIGN' && (
            <>
              <h2 className="title-sm">2. Khung tuần <span className="caption muted">({cells} ô/tuần)</span></h2>
              <table className="ta-week">
                <thead><tr><th />{[1, 2, 3, 4, 5, 6].map((w) => <th key={w}>{WEEKDAY_SHORT[w - 1]}</th>)}</tr></thead>
                <tbody>
                  {[['morning', 'Sáng', 5], ['afternoon', 'Chiều', 3]].map(([k, label, max]) => (
                    <tr key={k}><th scope="row">{label}</th>
                      {[1, 2, 3, 4, 5, 6].map((w) => (
                        <td key={w}><input className="input" type="number" min={0} max={max} aria-label={`${label} ${WEEKDAY_LONG[w - 1]}`}
                          value={form.grid.find((d) => d.weekday === w)?.[k] ?? 0} onChange={(e) => setGrid(w, k, Math.max(0, Math.min(max, Number(e.target.value) || 0)))} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="caption muted">Theo quy định: sáng tối đa 5 tiết, chiều tối đa 3 tiết, tối đa 6 ngày/tuần.</p>
              <div className="ta-fieldset">
                <span className="field-label">Ô cố định</span>
                <select className="input" value={form.fixed?.subjectId ?? ''} onChange={(e) => set('fixed', e.target.value ? { subjectId: e.target.value, slots: form.fixed?.slots ?? [{ weekday: 1, period: 1, label: 'Chào cờ' }, { weekday: 5, period: 5, label: 'Sinh hoạt lớp' }] } : null)}>
                  <option value="">Không có ô cố định</option>
                  {usedSubjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.name}</option>)}
                </select>
                {form.fixed?.subjectId && form.fixed.slots.map((s, i) => (
                  <div key={i} className="ta-fixed-row">
                    <input className="input" value={s.label} maxLength={40} aria-label="Tên ô" onChange={(e) => set('fixed', { ...form.fixed, slots: form.fixed.slots.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <select className="input" value={s.weekday} aria-label="Thứ" onChange={(e) => set('fixed', { ...form.fixed, slots: form.fixed.slots.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)) })}>
                      {[1, 2, 3, 4, 5, 6].map((w) => <option key={w} value={w}>{WEEKDAY_LONG[w - 1]}</option>)}
                    </select>
                    <select className="input" value={s.period} aria-label="Tiết" onChange={(e) => set('fixed', { ...form.fixed, slots: form.fixed.slots.map((x, j) => (j === i ? { ...x, period: Number(e.target.value) } : x)) })}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => <option key={p} value={p}>{p <= 5 ? `Sáng tiết ${p}` : `Chiều tiết ${p - 5}`}</option>)}
                    </select>
                  </div>
                ))}
                {form.fixed?.subjectId && <p className="caption muted">Mỗi lớp một giáo viên khác nhau (thường là GVCN), không tính vào định mức.</p>}
              </div>
            </>
          )}

          <h2 className="title-sm">{form.mode === 'ASSIGN' ? '2' : '3'}. Môn học</h2>
          {!usedSubjects.length ? <p className="caption muted">Chọn lớp để xem các môn.</p> : (
            <div className="ta-table-wrap">
              <table className="table ta-subjects">
                <thead><tr><th>Môn</th><th title="Số tiết/tuần theo tổ hợp">Tiết</th><th title="Số tiết/tuần của học kỳ này (để trống = theo tổ hợp)">HK này</th>{form.mode !== 'ASSIGN' && <><th title="Số phòng dùng chung cho môn (để trống = không giới hạn)">Phòng</th><th title="Môn nặng: ưu tiên tiết 1–3">Nặng</th><th title="Ưu tiên xếp buổi chiều">Chiều</th></>}</tr></thead>
                <tbody>
                  {usedSubjects.map((s) => {
                    const id = String(s.subjectId);
                    const byTrack = [...new Set(Object.entries(s.periodsByTrack).filter(([t]) => tracks.has(String(t))).map(([, n]) => n))].join(' / ');
                    return (
                      <tr key={id}>
                        <td>{s.name}</td>
                        <td>{byTrack}</td>
                        <td><input className="input ta-num" type="number" min={0} max={15} placeholder="—" value={form.periods[id] ?? ''} aria-label={`Số tiết ${s.name}`} onChange={(e) => set('periods', { ...form.periods, [id]: e.target.value })} /></td>
                        {form.mode !== 'ASSIGN' && (
                          <>
                            <td><input className="input ta-num" type="number" min={1} max={100} placeholder="∞" value={form.rooms[id] ?? ''} aria-label={`Số phòng ${s.name}`} onChange={(e) => set('rooms', { ...form.rooms, [id]: e.target.value })} /></td>
                            <td><input type="checkbox" checked={form.heavySubjectIds.includes(id)} onChange={() => toggleIn('heavySubjectIds', id)} aria-label={`${s.name} là môn nặng`} /></td>
                            <td><input type="checkbox" checked={form.afternoonSubjectIds.includes(id)} onChange={() => toggleIn('afternoonSubjectIds', id)} aria-label={`${s.name} ưu tiên chiều`} /></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="caption muted">Tiết: số tiết/tuần theo tổ hợp. HK này: đổi riêng cho học kỳ đang xếp (ví dụ Lịch sử học kỳ I 1 tiết, học kỳ II 2 tiết), để trống là giữ nguyên. Phòng: số phòng dùng chung (Tin học, sân GDTC), để trống là không giới hạn. Nặng: ưu tiên tiết 1–3. Chiều: ưu tiên buổi chiều.</p>

          <h2 className="title-sm">{form.mode === 'ASSIGN' ? '3' : '4'}. Giáo viên</h2>
          {/* Norms and the daily limit are School Manager settings now (Dung, 21/11/2026): shown here, edited in /school-settings. */}
          <div className="ta-load-summary">
            <p>
              Định mức <strong>{opts.defaults.norm}</strong> tiết/tuần · GVCN <strong>{opts.defaults.homeroomNorm}</strong> · vượt tối đa <strong>{opts.defaults.maxOver}</strong> tiết
              {form.mode !== 'ASSIGN' && <> · tối đa <strong>{opts.defaults.maxPerDay}</strong> tiết/ngày</>}
            </p>
            <Link className="tt-link" to="/school-settings"><Icon name="settings" size="sm" /> Sửa trong Cài đặt hệ thống</Link>
          </div>
          {form.mode !== 'ASSIGN' && (
            <div className="ta-fieldset">
              <span className="field-label">Giáo viên bận ({form.busy.length} ô)</span>
              <div className="ta-busy-add">
                <select className="input" value={busyDraft.teacherId} aria-label="Giáo viên" onChange={(e) => setBusyDraft({ ...busyDraft, teacherId: e.target.value })}>
                  <option value="">Chọn giáo viên…</option>
                  {opts.teachers.map((t) => <option key={t.teacherId} value={t.teacherId}>{t.name} ({t.code})</option>)}
                </select>
                <select className="input" value={busyDraft.weekday} aria-label="Thứ" onChange={(e) => setBusyDraft({ ...busyDraft, weekday: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6].map((w) => <option key={w} value={w}>{WEEKDAY_SHORT[w - 1]}</option>)}
                </select>
                <select className="input" value={busyDraft.period} aria-label="Tiết" onChange={(e) => setBusyDraft({ ...busyDraft, period: Number(e.target.value) })}>
                  <option value={0}>Cả ngày</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => <option key={p} value={p}>{p <= 5 ? `Sáng ${p}` : `Chiều ${p - 5}`}</option>)}
                </select>
                <button type="button" className="btn btn-secondary" disabled={!busyDraft.teacherId} onClick={() => {
                  const ps = busyDraft.period ? [busyDraft.period] : [1, 2, 3, 4, 5, 6, 7, 8];
                  const add = ps.map((p) => ({ teacherId: busyDraft.teacherId, weekday: busyDraft.weekday, period: p }))
                    .filter((x) => !form.busy.some((b) => b.teacherId === x.teacherId && b.weekday === x.weekday && b.period === x.period));
                  set('busy', [...form.busy, ...add]);
                }}>Thêm</button>
              </div>
              {form.busy.length > 0 && (
                <div className="ta-chips">
                  {form.busy.map((b, i) => (
                    <span key={`${b.teacherId}-${b.weekday}-${b.period}`} className="ta-chip is-on">
                      {teacherName.get(b.teacherId)} · {WEEKDAY_SHORT[b.weekday - 1]} {b.period <= 5 ? `S${b.period}` : `C${b.period - 5}`}
                      <button type="button" className="ta-x" aria-label="Bỏ ô bận" onClick={() => set('busy', form.busy.filter((_, j) => j !== i))}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <button type="button" className="tt-link" onClick={() => setShowWeights(!showWeights)} aria-expanded={showWeights}>
            <Icon name={showWeights ? 'expand_less' : 'expand_more'} size="sm" /> Nâng cao: trọng số, thời gian tìm
          </button>
          {showWeights && (
            <div className="ta-weights">
              {Object.keys(DEFAULT_WEIGHTS).filter((k) => form.mode !== 'ASSIGN' || ['S1', 'S8', 'S9'].includes(k)).map((k) => (
                <label key={k} className="ta-weight"><span>{WEIGHT_LABELS[k]}</span>
                  <input className="input ta-num" type="number" min={0} max={100} value={form.weights[k]} onChange={(e) => set('weights', { ...form.weights, [k]: e.target.value })} /></label>
              ))}
              {form.mode !== 'ASSIGN' && <label className="ta-weight"><span>Thời gian tìm (giây)</span>
                <input className="input ta-num" type="number" min={1} max={30} value={form.timeLimitSec} onChange={(e) => set('timeLimitSec', e.target.value)} /></label>}
            </div>
          )}

          <div className="ta-actions">
            <button type="button" className="btn btn-primary" onClick={() => run()} disabled={running || !form.classIds.length || !form.semesterId}>
              <Icon name="auto_awesome" size="sm" /> {running ? 'Đang xếp…' : 'Kiểm tra và xếp'}
            </button>
          </div>
          {runError && <div className="notice amber" role="alert"><Icon name="error_outline" /><p>{runError}</p></div>}
        </section>

        <section className="ta-result" aria-label="Kết quả" aria-busy={running}>
          {!result && !running && (
            <div className="card card-outline ta-placeholder"><Icon name="calendar_view_week" /><p>Chọn lớp, kiểm tra thiết lập rồi bấm <strong>Kiểm tra và xếp</strong>. Bản nháp hiện ở đây.</p></div>
          )}
          {running && <div className="card card-outline ta-placeholder"><p>Đang xếp, tối đa {form.timeLimitSec} giây…</p></div>}
          {result && !running && (
            <>
              {stale && <div className="notice amber"><Icon name="info" /><p>Thiết lập đã đổi sau lần xếp này. Bấm "Kiểm tra và xếp" lại trước khi áp dụng.</p></div>}
              {result.errors.length > 0 && (
                <div className="notice amber" role="alert"><Icon name="block" />
                  <div><strong>Chưa xếp được – cần sửa dữ liệu hoặc thiết lập:</strong>
                    <ul className="ta-list">{result.errors.map((e, i) => <li key={i}>{checkText(e, names)}</li>)}</ul></div>
                </div>
              )}
              {result.warnings.length > 0 && (
                <details className="ta-warn"><summary>{result.warnings.length} lưu ý</summary>
                  <ul className="ta-list">{result.warnings.map((e, i) => <li key={i}>{checkText(e, names)}</li>)}</ul></details>
              )}
              {result.ok && (
                <>
                  <div className="ta-stats">
                    <div className="card card-outline"><span className="label-upper">Lớp</span><strong>{Object.keys(result.timetables ?? {}).length || result.existing.length}</strong><span className="caption muted">{dmy(result.range.start)} – {dmy(result.range.end)}</span></div>
                    <div className="card card-outline"><span className="label-upper">Phân công đổi</span><strong>{changed}</strong><span className="caption muted">trên {result.assignments.length} cặp lớp – môn</span></div>
                    <div className="card card-outline"><span className="label-upper">Chưa xếp được</span><strong className={result.unplaced.length + result.unassigned.length ? 'tt-red' : ''}>{result.unplaced.reduce((n, u) => n + u.count, 0) + result.unassigned.length}</strong><span className="caption muted">tiết / cặp</span></div>
                    <div className="card card-outline"><span className="label-upper">Điểm phạt</span><strong>{result.score}</strong><span className="caption muted">{overTeachers.length} GV vượt định mức</span></div>
                  </div>
                  <div className="tt-seg ta-tabs" role="tablist">
                    {[result.timetables && ['class', 'Theo lớp'], result.timetables && ['teacher', 'Theo giáo viên'], ['assign', 'Phân công'], ['load', 'Tải giáo viên'],
                      ['issues', `Cần chú ý (${result.unplaced.length + result.unassigned.length + result.violations.length})`]].filter(Boolean).map(([k, label]) => (
                      <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'is-on' : ''} onClick={() => setView(k)}>{label}</button>
                    ))}
                  </div>

                  {view === 'class' && result.timetables && (
                    <div className="ta-panel">
                      <select className="input ta-pick" value={pickClass} onChange={(e) => setPickClass(e.target.value)} aria-label="Lớp">
                        {Object.keys(result.timetables).map((id) => <option key={id} value={id}>Lớp {className(id)}</option>)}
                      </select>
                      <Grid grid={resultGrid} cells={classCells(pickClass)} fixed={fixedLabels} />
                    </div>
                  )}
                  {view === 'teacher' && result.timetables && (
                    <div className="ta-panel">
                      <select className="input ta-pick" value={pickTeacher} onChange={(e) => setPickTeacher(e.target.value)} aria-label="Giáo viên">
                        {result.loads.map((l) => <option key={l.teacherId} value={l.teacherId}>{l.name} – {l.load}/{l.norm} tiết</option>)}
                      </select>
                      <Grid grid={resultGrid} cells={teacherCells(pickTeacher)} />
                      <p className="caption muted">Chỉ hiện các tiết của những lớp đang xếp; tiết ở lớp khác đã được tránh.</p>
                    </div>
                  )}
                  {view === 'assign' && (
                    <div className="ta-panel ta-table-wrap">
                      <table className="table ta-assign">
                        <thead><tr><th>Lớp</th><th>Môn</th><th>Giáo viên</th><th /></tr></thead>
                        <tbody>
                          {[...result.assignments].sort((a, b) => className(a.classId).localeCompare(className(b.classId)) || (names.subjects[a.subjectId] ?? '').localeCompare(names.subjects[b.subjectId] ?? '', 'vi')).map((a) => (
                            <tr key={`${a.classId}:${a.subjectId}`}>
                              <td>{className(a.classId)}</td><td>{names.subjects[a.subjectId]}</td><td>{names.teachers[a.teacherId]}</td>
                              <td>{a.kept ? <span className="ta-tag">Giữ nguyên</span> : a.changed ? <span className="ta-tag is-new">Mới</span> : <span className="ta-tag">Như cũ</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {view === 'load' && (
                    <div className="ta-panel ta-table-wrap">
                      <table className="table">
                        <thead><tr><th>Giáo viên</th><th>Định mức</th><th>Lớp khác</th><th>Tổng</th><th>Vượt</th></tr></thead>
                        <tbody>
                          {result.loads.map((l) => (
                            <tr key={l.teacherId}>
                              <td>{l.name}{l.homeroom && <span className="ta-tag">GVCN</span>}</td><td>{l.norm}</td><td>{l.base}</td><td><strong>{l.load}</strong></td>
                              <td className={l.over ? 'tt-red' : 'tt-muted'}>{l.over ? `+${l.over}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="caption muted">Tính cả tiết ở các lớp không nằm trong lần xếp này; Chào cờ và Sinh hoạt lớp không tính.</p>
                    </div>
                  )}
                  {view === 'issues' && (
                    <div className="ta-panel">
                      {result.unassigned.length + result.unplaced.length === 0 && result.violations.length === 0 && <p className="muted">Không có gì cần chú ý.</p>}
                      {result.unassigned.length > 0 && <><h3 className="title-sm tt-red">Chưa có giáo viên</h3><ul className="ta-list">{result.unassigned.map((u, i) => <li key={i}>{className(u.classId)} – {names.subjects[u.subjectId]}: {REASONS[u.reason] ?? u.reason}</li>)}</ul></>}
                      {result.unplaced.length > 0 && <><h3 className="title-sm tt-red">Tiết chưa xếp được</h3><ul className="ta-list">{result.unplaced.map((u, i) => <li key={i}>{className(u.classId)} – {names.subjects[u.subjectId]}: {u.count} tiết, {REASONS[u.reason] ?? u.reason}</li>)}</ul></>}
                      {result.violations.length > 0 && <><h3 className="title-sm">Chưa đẹp (không bắt buộc)</h3><ul className="ta-list">{result.violations.slice(0, 50).map((v, i) => <li key={i}>{violationText(v, names, className)}</li>)}</ul>
                        {result.violations.length > 50 && <p className="caption muted">… và {result.violations.length - 50} mục khác.</p>}</>}
                    </div>
                  )}

                  <div className="ta-apply-bar">
                    <button type="button" className="btn btn-secondary" onClick={() => run((form.seed % 1000000) + 1)} disabled={running}><Icon name="refresh" size="sm" /> Xếp lại (phương án khác)</button>
                    <button type="button" className="btn btn-primary" onClick={() => { setOverwriteOk(false); setApplyError(null); setConfirm(true); }} disabled={blocking || stale}
                      title={blocking ? 'Còn tiết hoặc môn chưa xếp được' : stale ? 'Thiết lập đã đổi' : undefined}>
                      <Icon name="check" size="sm" /> Áp dụng
                    </button>
                  </div>
                  {blocking && <p className="caption tt-red">Còn tiết hoặc môn chưa xếp được nên chưa áp dụng được – xem tab "Cần chú ý", chỉnh thiết lập rồi xếp lại.</p>}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {confirm && result && (
        <div className="tt-overlay" onClick={() => !applying && setConfirm(false)}>
          <div className="tt-dialog tt-dialog-sm" role="dialog" aria-modal="true" aria-labelledby="ta-apply-title" onClick={(e) => e.stopPropagation()}>
            <header className="tt-dialog-head"><div><span className="label-upper">Xếp tự động</span><h2 id="ta-apply-title" className="tt-dialog-title">Áp dụng bản nháp?</h2></div></header>
            <div className="tt-dialog-body">
              <ul className="ta-list">
                {form.mode !== 'TIMETABLE' && <li>{changed} phân công thay đổi, áp dụng từ {dmy(result.range.start)} đến {dmy(result.range.assignEnd)} (hết năm học).</li>}
                {form.mode !== 'ASSIGN' && <li>Thời khoá biểu {Object.keys(result.timetables ?? {}).length} lớp từ {dmy(result.range.start)} đến {dmy(result.range.end)}; tiết đã điểm danh được giữ.</li>}
                {form.mode !== 'ASSIGN' && <li>Các ngày trước {dmy(result.range.start)} (kể cả các ngày đã qua của tuần này) giữ nguyên thời khoá biểu cũ; thời khoá biểu cũ vẫn xem lại được ở "Lịch sử" của từng lớp.</li>}
              </ul>
              {overwrite.length > 0 && (
                <label className="ta-check ta-overwrite">
                  <input type="checkbox" checked={overwriteOk} onChange={(e) => setOverwriteOk(e.target.checked)} />
                  <span>Ghi đè thời khoá biểu / phân công đang có của lớp {overwrite.map((c) => c.className).join(', ')}.</span>
                </label>
              )}
              {applyError && (
                <div className="notice amber" role="alert"><Icon name="error_outline" />
                  <div><p>{errorText(applyError)}</p>
                    {applyError.code === 'MSG_AUTO_STALE' && <button type="button" className="btn btn-secondary" onClick={() => { setConfirm(false); run(); }}>Xếp lại với dữ liệu mới</button>}</div>
                </div>
              )}
            </div>
            <footer className="tt-dialog-foot"><span />
              <div className="tt-dialog-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)} disabled={applying}>Huỷ</button>
                <button type="button" className="btn btn-primary" onClick={apply} disabled={applying || (overwrite.length > 0 && !overwriteOk)}>{applying ? 'Đang lưu…' : 'Áp dụng'}</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
