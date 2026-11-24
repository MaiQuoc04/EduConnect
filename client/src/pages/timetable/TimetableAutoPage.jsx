import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { applyAutoSchedule, checkAutoSchedule, getAutoOptions, runAutoSchedule } from '../../api/timetables.js';
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
// One line under each weight: when the penalty is counted.
const WEIGHT_HELP = {
  S1: 'Mỗi tiết/tuần giáo viên dạy quá định mức.',
  S2: 'Mỗi tiết rảnh kẹp giữa hai tiết dạy của giáo viên trong một buổi.',
  S3: 'Hai tiết cùng môn trong một ngày của lớp mà có tiết khác chen giữa.',
  S4: 'Mỗi tiết giáo viên dạy vượt số tiết tối đa một ngày.',
  S5: 'Môn có từ 2 tiết/tuần trở lên nhưng dồn hết vào một ngày.',
  S6: 'Mỗi tiết Toán, Văn, Anh (môn nặng) xếp ở tiết 4–5 hoặc buổi chiều.',
  S7: 'Mỗi tiết môn ưu tiên buổi chiều (thể dục…) bị xếp buổi sáng.',
  S8: 'Chênh lệch số tiết giữa các giáo viên cùng dạy một môn.',
  S9: 'GVCN không được phân công dạy môn nào ở lớp mình chủ nhiệm.',
  GAP: 'Mỗi ô trống của lớp nằm trước một tiết học trong cùng buổi.',
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

// The draft that "Áp dụng" sends, from a run's result (edited by hand afterwards).
const draftOf = (r) => ({
  assignments: (r.assignments ?? []).map(({ classId, subjectId, teacherId }) => ({ classId: String(classId), subjectId: String(subjectId), teacherId: String(teacherId) })),
  timetables: Object.fromEntries(Object.entries(r.timetables ?? {}).map(([cid, list]) => [cid, list.map((e) => ({ weekday: e.weekday, period: e.period, subjectId: String(e.subjectId) }))])),
});

// One problem of a draft (POST /auto/check, or the review of a run): errors block "Áp dụng", warnings do not.
function problemText(v, names, className) {
  const sub = names.subjects[v.subjectId] ?? '';
  const teacher = names.teachers[v.teacherId] ?? '';
  const cls = v.classId ? `Lớp ${className(v.classId)}` : '';
  const at = v.weekday ? `${WEEKDAY_LONG[v.weekday - 1]} tiết ${v.period}` : '';
  switch (v.code) {
    case 'NO_TEACHER': return `${cls} – ${sub}: chưa có giáo viên.`;
    case 'TEACHER_UNKNOWN': return `${cls} – ${sub}: giáo viên không còn trong danh sách.`;
    case 'TEACHER_LOCKED': return `${cls} – ${sub}: ${teacher} đã bị khoá tài khoản.`;
    case 'NOT_QUALIFIED': return `${cls} – ${sub}: ${teacher} chưa đăng ký dạy môn này.`;
    case 'OVER_CAP': return `${teacher}: ${v.load} tiết/tuần, vượt mức tối đa ${v.cap} (định mức + số tiết được vượt).`;
    case 'FIXED_SAME_TEACHER': return `${teacher} phụ trách ${sub} ở cả lớp ${v.classIds.map(className).join(' và ')}, nhưng ô cố định trùng giờ ở mọi lớp.`;
    case 'CLASS_MISSING': return `${cls}: bản nháp thiếu thời khoá biểu của lớp.`;
    case 'OUTSIDE_GRID': return `${cls}: ${sub} ở ${at}, ngoài khung tuần.`;
    case 'CLASS_CLASH': return `${cls}: ${at} có hai môn cùng lúc.`;
    case 'SUBJECT_NOT_IN_CLASS': return `${cls}: lớp không học ${sub || 'môn này'}.`;
    case 'SUBJECT_DAY_LIMIT': return `${cls}: ${sub} có ${v.count} tiết trong ${WEEKDAY_LONG[v.weekday - 1]}, tối đa ${v.max} tiết/ngày.`;
    case 'TEACHER_MARKED_BUSY': return `${cls}: ${teacher} (${sub}) đã được đánh dấu bận ${at}.`;
    case 'TEACHER_OTHER_CLASS': return `${cls}: ${teacher} (${sub}) đang dạy lớp ${v.other} ${at}.`;
    case 'TEACHER_CLASH': return `${teacher} dạy cùng lúc lớp ${v.classIds.map(className).join(', ')} ${at}.`;
    case 'ROOM_FULL': return `${sub}: ${v.classIds.length} lớp học cùng ${at} nhưng chỉ có ${v.rooms} phòng (${v.classIds.map(className).join(', ')}).`;
    case 'PERIODS_SHORT': return `${cls} – ${sub}: mới xếp ${v.placed}/${v.need} tiết.`;
    case 'PERIODS_OVER': return `${cls} – ${sub}: xếp ${v.placed} tiết, thừa so với ${v.need} tiết/tuần.`;
    case 'FIXED_SLOT': return `${cls}: ô cố định ${v.label || ''} ${at} phải là ${sub}.`;
    case 'S1': return `${teacher}: ${v.load} tiết/tuần, vượt định mức ${v.norm} tiết.`;
    case 'S9': return `${cls}: GVCN ${teacher} không dạy tiết nào của lớp mình.`;
    default: return violationText(v, names, className);
  }
}
// What to do about a problem, in one sentence (shown under the problem).
function fixHint(v, names) {
  const sub = names.subjects[v.subjectId] ?? 'môn này';
  switch (v.code) {
    case 'PERIODS_SHORT': return `Cách sửa: chọn một ô trống của lớp rồi xếp ${sub} vào (thiếu ${v.need - v.placed} tiết).`;
    case 'PERIODS_OVER': return `Cách sửa: bấm vào một tiết ${sub} của lớp và chọn "Để trống ô này" hoặc thay bằng môn còn thiếu (thừa ${v.placed - v.need} tiết).`;
    case 'TEACHER_OTHER_CLASS':
    case 'TEACHER_CLASH':
    case 'TEACHER_MARKED_BUSY': return 'Cách sửa: bấm vào ô này, chọn "Đổi chỗ" sang một tiết mà giáo viên rảnh, hoặc đổi giáo viên ở tab "Phân công".';
    case 'CLASS_CLASH': return 'Cách sửa: bấm vào ô và chọn lại một môn.';
    case 'SUBJECT_DAY_LIMIT': return `Cách sửa: đổi chỗ một tiết ${sub} sang ngày khác.`;
    case 'FIXED_SLOT': return 'Cách sửa: bấm "Hoàn tác" hoặc "Về bản gốc" để trả ô cố định về chỗ cũ.';
    case 'ROOM_FULL': return `Cách sửa: đổi chỗ tiết ${sub} của một lớp sang tiết khác.`;
    case 'OUTSIDE_GRID': return 'Cách sửa: đổi chỗ tiết này vào một ô trong khung tuần.';
    case 'NOT_QUALIFIED':
    case 'TEACHER_LOCKED':
    case 'TEACHER_UNKNOWN':
    case 'NO_TEACHER': return 'Cách sửa: chọn giáo viên khác ở tab "Phân công".';
    case 'OVER_CAP': return 'Cách sửa: chuyển bớt một lớp của giáo viên này cho người khác ở tab "Phân công".';
    case 'FIXED_SAME_TEACHER': return 'Cách sửa: chọn giáo viên khác cho một trong hai lớp ở tab "Phân công".';
    default: return '';
  }
}

// Cell of a problem in the class view / teacher view.
const problemCells = (v) => (v.weekday && v.period ? [`${v.weekday}-${v.period}`] : []);

const periodsOf = (grid) => {
  const morning = Math.max(0, ...grid.map((d) => d.morning));
  const afternoon = Math.max(0, ...grid.map((d) => d.afternoon));
  return [...Array.from({ length: morning }, (_, i) => i + 1), ...Array.from({ length: afternoon }, (_, i) => 6 + i)];
};
const inGrid = (grid, w, p) => {
  const d = grid.find((x) => x.weekday === w);
  return Boolean(d) && (p <= 5 ? p <= d.morning : p - 5 <= d.afternoon);
};

// Week grid of a draft. With onCell the cells are buttons (edit by hand): click to select, drag a lesson onto another
// cell of the same class to swap them. marks: cell -> 'error' | 'warn'.
function Grid({ grid, cells, fixed, empty = '', onCell, onSwap, selected, swapFrom, marks }) {
  const days = grid.map((d) => d.weekday);
  const periods = periodsOf(grid);
  const [dragFrom, setDragFrom] = useState(null);
  return (
    <div className="ta-grid-wrap">
      <table className={`ta-grid${onCell ? ' is-editable' : ''}`}>
        <thead><tr><th scope="col">Tiết</th>{days.map((w) => <th key={w} scope="col">{WEEKDAY_LONG[w - 1]}</th>)}</tr></thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p} className={p === 6 ? 'ta-afternoon-start' : ''}>
              <th scope="row">{p <= 5 ? `S${p}` : `C${p - 5}`}</th>
              {days.map((w) => {
                if (!inGrid(grid, w, p)) return <td key={w} className="ta-off" aria-label="Không học" />;
                const k = `${w}-${p}`;
                const c = cells.get(k);
                const f = fixed?.get(k);
                const mark = marks?.get(k);
                const cls = [c ? (f ? 'ta-fixed' : '') : 'ta-empty', c?.faded ? 'is-faded' : '', mark ? `is-${mark}` : '',
                  selected === k ? 'is-selected' : '', swapFrom === k ? 'is-swap-from' : ''].filter(Boolean).join(' ');
                const body = c ? <><strong>{c.title}</strong><span>{f ? `${f} · ` : ''}{c.sub}</span></> : <span className="tt-faint">{empty}</span>;
                if (!onCell) return <td key={w} className={cls}>{body}</td>;
                return (
                  <td key={w} className={cls}
                    draggable={Boolean(c) && !f}
                    onDragStart={() => setDragFrom(k)}
                    onDragEnd={() => setDragFrom(null)}
                    onDragOver={(e) => { if (dragFrom && dragFrom !== k && !f) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragFrom && dragFrom !== k) onSwap(dragFrom, k); setDragFrom(null); }}>
                    <button type="button" className="ta-cell-btn" onClick={() => onCell(k)}
                      aria-label={`${WEEKDAY_LONG[w - 1]} tiết ${p}: ${c ? c.title : 'trống'}${mark === 'error' ? ' – có lỗi' : ''}`}>{body}</button>
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
  // Draft edited by hand (Dung, 21/11/2026): the run's draft is copied into `draft`; every change is checked again by
  // POST /auto/check (the same rules as "Áp dụng") and the problems are shown on the cells and in "Cần chú ý".
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [review, setReview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [checkStale, setCheckStale] = useState(false);
  const [selCell, setSelCell] = useState(null);
  const [swapFrom, setSwapFrom] = useState(null);
  const checkSeq = useRef(0);

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

  // Check the edited draft again 0.4 s after the last change (only the newest answer is kept).
  const resultStamp = result?.stamp;
  useEffect(() => {
    if (!draft || !history.length || !ranWith) return undefined;
    checkSeq.current += 1;
    const seq = checkSeq.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const r = await checkAutoSchedule({ config: JSON.parse(ranWith), draft });
        if (seq !== checkSeq.current) return;
        setReview(r);
        setCheckError('');
        setCheckStale(Boolean(resultStamp) && r.stamp !== resultStamp);
      } catch (err) {
        if (seq === checkSeq.current) setCheckError(errorText(err));
      } finally {
        if (seq === checkSeq.current) setChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, history.length, ranWith, resultStamp]);

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
      setDraft(r.ok ? draftOf(r) : null);
      setHistory([]);
      setReview(r.review ?? null);
      setChecking(false);
      setCheckError('');
      setCheckStale(false);
      setSelCell(null);
      setSwapFrom(null);
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
        draft,
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
  const assignList = draft?.assignments ?? result?.assignments ?? [];
  const assignOf = new Map(assignList.map((a) => [`${a.classId}:${a.subjectId}`, a]));
  const timetablesNow = draft?.timetables ?? result?.timetables ?? null;
  const fixedCells = new Set((ranWith ? JSON.parse(ranWith).fixed?.slots ?? [] : []).map((s) => `${s.weekday}-${s.period}`));
  const fixedLabels = new Map((ranWith ? JSON.parse(ranWith).fixed?.slots ?? [] : []).map((s) => [`${s.weekday}-${s.period}`, s.label || 'Cố định']));
  const resultGrid = ranWith ? JSON.parse(ranWith).grid : form.grid;
  const classCells = (cid) => new Map((timetablesNow?.[cid] ?? []).map((e) => [`${e.weekday}-${e.period}`, { title: names.subjects[e.subjectId], sub: names.teachers[assignOf.get(`${cid}:${e.subjectId}`)?.teacherId] ?? '' }]));
  const teacherCells = (tid) => {
    const m = new Map();
    // Lessons of the classes outside this run (faded): the draft has to avoid them.
    for (const [cell, other] of Object.entries(result?.busy?.[String(tid)] ?? {})) {
      m.set(cell, other ? { title: `Lớp ${other}`, sub: 'ngoài lần xếp', faded: true } : { title: 'Bận', sub: 'đã đánh dấu', faded: true });
    }
    for (const [cid, list] of Object.entries(timetablesNow ?? {})) {
      for (const e of list) if (assignOf.get(`${cid}:${e.subjectId}`)?.teacherId === String(tid)) m.set(`${e.weekday}-${e.period}`, { title: className(cid), sub: names.subjects[e.subjectId] });
    }
    return m;
  };
  const problems = review ? [...review.errors.map((v) => ({ ...v, level: 'error' })), ...review.warnings.map((v) => ({ ...v, level: 'warn' }))] : [];
  const marksFor = (pred) => {
    const m = new Map();
    for (const v of problems) {
      if (!pred(v)) continue;
      for (const k of problemCells(v)) if (m.get(k) !== 'error') m.set(k, v.level);
    }
    return m;
  };
  const ofClass = (cid) => (v) => v.classId === String(cid) || (v.classIds ?? []).includes(String(cid));
  const loadsNow = review?.loads ?? result?.loads ?? [];
  const loadOf = new Map(loadsNow.map((l) => [String(l.teacherId), l]));

  // ── editing ──
  const edit = (fn) => {
    setHistory((h) => [...h, draft]);
    setDraft(fn(JSON.parse(JSON.stringify(draft))));
  };
  const undo = () => {
    if (!history.length) return;
    setDraft(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    if (history.length === 1) { setReview(result.review ?? null); setCheckError(''); setCheckStale(false); setChecking(false); }
  };
  const resetDraft = () => {
    setDraft(draftOf(result));
    setHistory([]);
    setReview(result.review ?? null);
    setChecking(false);
    setCheckError('');
    setCheckStale(false);
    setSelCell(null);
    setSwapFrom(null);
  };
  const cellOf = (k) => k.split('-').map(Number);
  const swapCells = (cid, a, b) => {
    if (fixedCells.has(a) || fixedCells.has(b)) return;
    edit((d) => {
      const [wa, pa] = cellOf(a);
      const [wb, pb] = cellOf(b);
      const list = d.timetables[cid] ?? [];
      const ea = list.find((e) => e.weekday === wa && e.period === pa);
      const eb = list.find((e) => e.weekday === wb && e.period === pb);
      if (ea) { ea.weekday = wb; ea.period = pb; }
      if (eb) { eb.weekday = wa; eb.period = pa; }
      return d;
    });
  };
  const setCellSubject = (cid, k, subjectId) => edit((d) => {
    const [w, p] = cellOf(k);
    d.timetables[cid] = (d.timetables[cid] ?? []).filter((e) => !(e.weekday === w && e.period === p));
    if (subjectId) d.timetables[cid].push({ weekday: w, period: p, subjectId });
    d.timetables[cid].sort((x, y) => x.weekday - y.weekday || x.period - y.period);
    return d;
  });
  const setTeacher = (classId, subjectId, teacherId) => edit((d) => {
    const a = d.assignments.find((x) => x.classId === classId && x.subjectId === subjectId);
    if (a) a.teacherId = teacherId;
    else d.assignments.push({ classId, subjectId, teacherId });
    return d;
  });
  const onClassCell = (k) => {
    if (swapFrom && swapFrom !== k) {
      swapCells(pickClass, swapFrom, k);
      setSwapFrom(null);
      setSelCell(k);
      return;
    }
    setSwapFrom(null);
    setSelCell(selCell === k ? null : k);
  };
  // Where a teacher is at a cell besides this class: another class of the draft, a class outside the run, marked busy.
  const teacherElsewhere = (tid, cid, k) => {
    if (!tid) return null;
    const out = result?.busy?.[String(tid)]?.[k];
    if (out !== undefined) return out ? `đang dạy lớp ${out}` : 'đã đánh dấu bận';
    const [w, p] = cellOf(k);
    for (const [other, list] of Object.entries(timetablesNow ?? {})) {
      if (other === String(cid)) continue;
      if (list.some((e) => e.weekday === w && e.period === p && assignOf.get(`${other}:${e.subjectId}`)?.teacherId === String(tid))) return `đang dạy lớp ${className(other)} trong bản nháp`;
    }
    return null;
  };
  // Teachers who can take a class and subject (every lesson of it in the draft): all teachers of the school registered
  // for the subject. `why` says why one cannot be chosen: teaching elsewhere at one of these lessons, or over the
  // weekly maximum (norm + periods over it). The current teacher comes first.
  const teacherChoices = (classId, subjectId) => {
    const sid = String(subjectId);
    const cur = assignOf.get(`${classId}:${sid}`)?.teacherId;
    const ranCfg = ranWith ? JSON.parse(ranWith) : {};
    const fixedSid = ranCfg.fixed?.slots?.length ? String(ranCfg.fixed.subjectId) : null;
    const teaching = result?.teaching ?? opts.defaults;
    const periodsOf2 = (cid, s2) => {
      const n = (result?.classSubjects?.[cid] ?? []).find((x) => String(x.subjectId) === String(s2))?.periods ?? 0;
      return String(s2) === fixedSid ? Math.max(0, n - ranCfg.fixed.slots.length) : n; // Chào cờ / Sinh hoạt lớp not counted
    };
    // Weekly load of a teacher with this draft: classes outside the run + every class and subject of the draft.
    const loadNow = (tid) => (result?.teacherBase?.[tid]?.base ?? 0)
      + assignList.filter((a) => a.teacherId === tid).reduce((n, a) => n + periodsOf2(a.classId, a.subjectId), 0);
    const add = periodsOf2(classId, sid);
    const cells = (timetablesNow?.[classId] ?? []).filter((e) => e.subjectId === sid).map((e) => `${e.weekday}-${e.period}`);
    const list = opts.teachers.filter((t) => (t.subjectIds ?? []).map(String).includes(sid)).map((t) => {
      const tid = String(t.teacherId);
      const norm = result?.teacherBase?.[tid]?.homeroom ? teaching.homeroomNorm : teaching.norm;
      const cap = norm + Number(teaching.maxOver ?? 0);
      const now = loadNow(tid);
      // What the teacher teaches now: the classes of this draft (by subject) + periods in classes outside the run.
      const teaches = assignList.filter((a) => a.teacherId === tid && periodsOf2(a.classId, a.subjectId) > 0)
        .map((a) => ({ label: `${names.subjects[a.subjectId]} ${className(a.classId)}`, periods: periodsOf2(a.classId, a.subjectId) }));
      const outside = result?.teacherBase?.[tid]?.base ?? 0;
      const homeroom = Boolean(result?.teacherBase?.[tid]?.homeroom);
      const base = { tid, name: t.name, code: t.code, now, norm, cap, teaches, outside, homeroom, add };
      if (tid === cur) return { ...base, current: true, after: now, why: '' };
      const after = now + add;
      const clashAt = cells.filter((k) => teacherElsewhere(tid, classId, k));
      const fixedOther = sid === fixedSid ? assignList.find((a) => a.subjectId === sid && a.teacherId === tid && a.classId !== String(classId)) : null;
      let why = '';
      if (clashAt.length) why = `bận ${clashAt.map((k) => { const [w, p] = cellOf(k); return `${WEEKDAY_LONG[w - 1]} tiết ${p}`; }).join(', ')} (${teacherElsewhere(tid, classId, clashAt[0])})`;
      else if (fixedOther) why = `đã phụ trách ${names.subjects[sid]} lớp ${className(fixedOther.classId)}, mà ô cố định trùng giờ ở mọi lớp`;
      else if (after > cap) why = `nhận thêm ${add} tiết thì thành ${after}/tuần, quá mức tối đa ${cap} (định mức ${norm} + ${teaching.maxOver})`;
      return { ...base, current: false, after, why };
    });
    if (cur && !list.some((x) => x.current)) list.unshift({ tid: cur, name: names.teachers[cur] ?? cur, code: '', now: loadNow(cur), after: loadNow(cur), norm: teaching.norm, cap: teaching.norm + teaching.maxOver, teaches: [], outside: 0, homeroom: false, add, current: true, why: '' });
    return list.sort((a, b) => Number(b.current) - Number(a.current) || Number(Boolean(a.why)) - Number(Boolean(b.why)) || a.after - b.after || a.name.localeCompare(b.name, 'vi'));
  };

  // One teacher in "Đổi giáo viên": load now (with the classes), norm, load after taking this class and subject.
  const teacherCard = (t, subjectLabel) => {
    const diff = t.after - t.norm;
    const status = diff > 0 ? { cls: 'is-over', text: `Vượt định mức ${diff} tiết – vẫn được phép (tối đa ${t.cap}), chỉ cộng điểm phạt` }
      : diff === 0 ? { cls: 'is-full', text: 'Vừa đủ định mức' } : { cls: 'is-under', text: `Còn thiếu ${-diff} tiết so với định mức` };
    return (
      <>
        <strong className="ta-tc-name">{t.name}{t.homeroom && <span className="ta-tag">GVCN</span>}{t.current && <span className="ta-tag is-hand">Đang phân công</span>}</strong>
        <span className="ta-tc-row"><span>Đang dạy</span><b>{t.now} tiết/tuần</b></span>
        <span className="ta-tc-classes">
          {t.teaches.length ? t.teaches.slice(0, 5).map((x) => `${x.label} (${x.periods})`).join(', ') : 'Chưa dạy lớp nào trong lần xếp này'}
          {t.teaches.length > 5 ? `, … ${t.teaches.length - 5} lớp khác` : ''}
          {t.outside ? ` + ${t.outside} tiết ở lớp ngoài lần xếp` : ''}
        </span>
        <span className="ta-tc-row"><span>Định mức{t.homeroom ? ' (GVCN)' : ''}</span><b>{t.norm} tiết/tuần</b></span>
        {!t.current && <span className="ta-tc-row"><span>Nếu nhận {subjectLabel} (+{t.add})</span><b>{t.after} tiết/tuần</b></span>}
        <span className={`ta-tc-status ${status.cls}`}>{t.current ? (diff > 0 ? `Đang vượt định mức ${diff} tiết` : diff === 0 ? 'Đang vừa đủ định mức' : `Đang thiếu ${-diff} tiết so với định mức`) : status.text}</span>
      </>
    );
  };

  const jumpTo = (v) => {
    const cid = v.classId ?? v.classIds?.[0];
    if (cid && v.weekday && timetablesNow) {
      setView('class');
      setPickClass(String(cid));
      setSwapFrom(null);
      setSelCell(`${v.weekday}-${v.period}`);
    } else if (v.teacherId && timetablesNow && !v.classId) {
      setView('teacher');
      setPickTeacher(String(v.teacherId));
    } else {
      setView('assign');
    }
  };
  const overwrite = (result?.existing ?? []).filter((c) => (form.mode !== 'ASSIGN' && c.hasTimetable) || (form.mode !== 'TIMETABLE' && c.assigned > 0
    && assignList.some((a) => {
      const o = (result.assignments ?? []).find((x) => x.classId === a.classId && x.subjectId === a.subjectId);
      return a.classId === String(c.classId) && (!o || o.teacherId !== a.teacherId || o.changed);
    })));
  const original = new Map((result?.assignments ?? []).map((a) => [`${a.classId}:${a.subjectId}`, a]));
  // Assignments that differ from the ones running now (a teacher changed by hand counts as a change).
  const changed = assignList.filter((a) => {
    const o = original.get(`${a.classId}:${a.subjectId}`);
    return !o || (o.teacherId !== a.teacherId ? true : o.changed);
  }).length;
  const overTeachers = loadsNow.filter((l) => l.over > 0);
  const missing = review
    ? review.errors.filter((v) => v.code === 'PERIODS_SHORT').reduce((n, v) => n + v.need - v.placed, 0) + review.errors.filter((v) => v.code === 'NO_TEACHER').length
    : (result?.unplaced ?? []).reduce((n, u) => n + u.count, 0) + (result?.unassigned ?? []).length;
  const blocking = result && (!result.ok || checking || Boolean(checkError) || (review ? !review.ok : result.unplaced.length > 0 || result.unassigned.length > 0));
  const edited = history.length > 0;

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
              <p className="caption muted ta-weights-intro">
                Quy tắc bắt buộc (không trùng giáo viên, đủ số tiết…) luôn được giữ. Các số dưới đây là <strong>mức phạt cho mỗi lần</strong> bản
                nháp làm chưa đẹp một điều; <strong>điểm phạt</strong> của bản nháp là tổng các mức phạt. Số càng lớn, hệ thống càng cố tránh điều đó;
                đặt 0 để bỏ qua. Ví dụ: mặc định một ô trống giữa buổi (20) bị tránh hơn một tiết môn nặng ở tiết 4–5 (3).
              </p>
              {Object.keys(DEFAULT_WEIGHTS).filter((k) => form.mode !== 'ASSIGN' || ['S1', 'S8', 'S9'].includes(k)).map((k) => (
                <label key={k} className="ta-weight">
                  <span className="ta-weight-text"><span>{WEIGHT_LABELS[k]}</span><span className="caption muted">{WEIGHT_HELP[k]}</span></span>
                  <input className="input ta-num" type="number" min={0} max={100} value={form.weights[k]} onChange={(e) => set('weights', { ...form.weights, [k]: e.target.value })} />
                </label>
              ))}
              {form.mode !== 'ASSIGN' && (
                <label className="ta-weight">
                  <span className="ta-weight-text"><span>Thời gian tìm (giây)</span><span className="caption muted">Tìm lâu hơn thường ra bản nháp ít điểm phạt hơn; 1–30 giây.</span></span>
                  <input className="input ta-num" type="number" min={1} max={30} value={form.timeLimitSec} onChange={(e) => set('timeLimitSec', e.target.value)} />
                </label>
              )}
              <button type="button" className="tt-link ta-weights-reset" onClick={() => set('weights', { ...DEFAULT_WEIGHTS })}>Đặt lại mức phạt mặc định</button>
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
                    <div className="card card-outline"><span className="label-upper">Lớp</span><strong>{Object.keys(timetablesNow ?? {}).length || result.existing.length}</strong><span className="caption muted">{dmy(result.range.start)} – {dmy(result.range.end)}</span></div>
                    <div className="card card-outline"><span className="label-upper">Phân công đổi</span><strong>{changed}</strong><span className="caption muted">trên {result.assignments.length} cặp lớp – môn</span></div>
                    <div className="card card-outline"><span className="label-upper">Chưa xếp được</span><strong className={missing ? 'tt-red' : ''}>{missing}</strong><span className="caption muted">tiết / cặp</span></div>
                    <div className="card card-outline"><span className="label-upper">Điểm phạt</span><strong>{review?.score ?? result.score}</strong><span className="caption muted">{overTeachers.length} GV vượt định mức</span></div>
                  </div>
                  <div className={`ta-edit-bar${review && !review.ok ? ' has-errors' : ''}`} role="status">
                    <Icon name={checking ? 'hourglass_top' : review && !review.ok ? 'error_outline' : 'edit_note'} size="sm" />
                    <p>
                      {edited ? <><strong>Đã chỉnh tay {history.length} thao tác.</strong> </> : 'Có thể chỉnh bản nháp trước khi áp dụng: bấm vào một ô để đổi môn, kéo một tiết thả vào ô khác để đổi chỗ, đổi giáo viên ở tab "Phân công". '}
                      {checking ? 'Đang kiểm tra lại…'
                        : checkError ? <span className="tt-red">{checkError}</span>
                          : review ? (review.ok ? <span className="ta-ok">Hợp lệ với mọi quy tắc bắt buộc.</span> : <span className="tt-red">{review.errors.length} lỗi phải sửa.</span>) : null}
                      {review && review.warnings.length > 0 && !checking && <> {review.warnings.length} điểm chưa đẹp (không bắt buộc, chỉ cộng điểm phạt – xem tab "Cần chú ý").</>}
                    </p>
                    {edited && <div className="ta-edit-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={undo}><Icon name="undo" size="sm" /> Hoàn tác</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={resetDraft}>Về bản gốc</button>
                    </div>}
                  </div>
                  {review && !review.ok && !checking && (
                    <div className="ta-fix-box" role="alert">
                      <strong>Phải sửa {review.errors.length} lỗi dưới đây trước khi áp dụng:</strong>
                      <ul className="ta-fix-list">
                        {review.errors.slice(0, 6).map((v, i) => (
                          <li key={i} className="is-error">
                            <strong>{problemText(v, names, className)}</strong>
                            {fixHint(v, names) && <span>{fixHint(v, names)}</span>}
                            <button type="button" className="tt-link" onClick={() => jumpTo(v)}>Đến chỗ lỗi</button>
                          </li>
                        ))}
                      </ul>
                      {review.errors.length > 6 && <p className="caption">… và {review.errors.length - 6} lỗi khác ở tab "Cần chú ý".</p>}
                    </div>
                  )}
                  {checkStale && <div className="notice amber"><Icon name="info" /><p>Phân công hoặc thời khoá biểu trong hệ thống vừa thay đổi sau lần xếp này. Áp dụng sẽ bị từ chối; hãy xếp lại.</p></div>}
                  <div className="tt-seg ta-tabs" role="tablist">
                    {[timetablesNow && ['class', 'Theo lớp'], timetablesNow && ['teacher', 'Theo giáo viên'], ['assign', 'Phân công'], ['load', 'Tải giáo viên'],
                      ['issues', `Cần chú ý (${review ? problems.length : result.unplaced.length + result.unassigned.length + result.violations.length})`]].filter(Boolean).map(([k, label]) => (
                      <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'is-on' : ''} onClick={() => setView(k)}>{label}</button>
                    ))}
                  </div>

                  {view === 'class' && timetablesNow && (
                    <div className="ta-panel">
                      <select className="input ta-pick" value={pickClass} onChange={(e) => { setPickClass(e.target.value); setSelCell(null); setSwapFrom(null); }} aria-label="Lớp">
                        {Object.keys(timetablesNow).map((id) => {
                          const n = review ? review.errors.filter(ofClass(id)).length : 0;
                          return <option key={id} value={id}>Lớp {className(id)}{n ? ` – ${n} lỗi` : ''}</option>;
                        })}
                      </select>
                      {swapFrom && <p className="caption ta-swap-hint"><Icon name="swap_horiz" size="sm" /> Chọn ô cần đổi chỗ với {WEEKDAY_LONG[cellOf(swapFrom)[0] - 1]} tiết {cellOf(swapFrom)[1]}. <button type="button" className="tt-link" onClick={() => setSwapFrom(null)}>Huỷ</button></p>}
                      <Grid grid={resultGrid} cells={classCells(pickClass)} fixed={fixedLabels} marks={marksFor(ofClass(pickClass))}
                        onCell={onClassCell} onSwap={(a, b) => swapCells(pickClass, a, b)} selected={selCell} swapFrom={swapFrom} />
                      {selCell && (() => {
                        const [w, p] = cellOf(selCell);
                        const list = timetablesNow[pickClass] ?? [];
                        const entry = list.find((e) => e.weekday === w && e.period === p);
                        const subjects = result.classSubjects?.[pickClass] ?? [];
                        const need = (sid) => subjects.find((x) => String(x.subjectId) === String(sid))?.periods ?? 0;
                        const placed = (sid) => list.filter((e) => e.subjectId === String(sid)).length;
                        const teacherOf = (sid) => assignOf.get(`${pickClass}:${sid}`)?.teacherId;
                        const onDay = (sid, day, except = []) => list.filter((e) => e.subjectId === String(sid) && e.weekday === day && !except.includes(`${e.weekday}-${e.period}`)).length;
                        const maxDay = Number(JSON.parse(ranWith).maxPerSubjectDay) || 2;
                        const here = problems.filter((v) => ofClass(pickClass)(v) && problemCells(v).includes(selCell));
                        const fixedCell = fixedCells.has(selCell);
                        const cur = entry ? `${names.subjects[entry.subjectId]} (${names.teachers[teacherOf(entry.subjectId)] ?? 'chưa có GV'})` : 'ô trống';
                        // Swap candidates: every other cell of the class; a swap keeps the number of periods of each subject.
                        const swaps = [];
                        if (entry && !fixedCell) {
                          for (const d of resultGrid) {
                            for (const p2 of periodsOf(resultGrid)) {
                              const k2 = `${d.weekday}-${p2}`;
                              if (k2 === selCell || !inGrid(resultGrid, d.weekday, p2) || fixedCells.has(k2)) continue;
                              const e2 = list.find((e) => e.weekday === d.weekday && e.period === p2);
                              if (e2 && e2.subjectId === entry.subjectId) continue;
                              const why = [];
                              const t1 = teacherOf(entry.subjectId);
                              const b1 = teacherElsewhere(t1, pickClass, k2);
                              if (b1) why.push(`${names.teachers[t1]} ${b1} lúc ${WEEKDAY_LONG[d.weekday - 1]} tiết ${p2}`);
                              if (e2) {
                                const t2 = teacherOf(e2.subjectId);
                                const b2 = teacherElsewhere(t2, pickClass, selCell);
                                if (b2) why.push(`${names.teachers[t2]} ${b2} lúc ${WEEKDAY_LONG[w - 1]} tiết ${p}`);
                              }
                              if (d.weekday !== w && onDay(entry.subjectId, d.weekday) + 1 > maxDay) why.push(`${names.subjects[entry.subjectId]} đã có ${maxDay} tiết trong ${WEEKDAY_LONG[d.weekday - 1]}`);
                              if (e2 && d.weekday !== w && onDay(e2.subjectId, w) + 1 > maxDay) why.push(`${names.subjects[e2.subjectId]} đã có ${maxDay} tiết trong ${WEEKDAY_LONG[w - 1]}`);
                              swaps.push({ k2, e2, why });
                            }
                          }
                        }
                        const okSwaps = swaps.filter((x) => !x.why.length);
                        const badSwaps = swaps.filter((x) => x.why.length);
                        // Subjects that can replace this cell: not the current one; refused when the subject already has
                        // all its periods, its teacher is elsewhere at this time, or the day limit is reached.
                        const options = subjects.filter((x) => String(x.subjectId) !== entry?.subjectId).map((x) => {
                          const sid = String(x.subjectId);
                          const tid = teacherOf(sid);
                          let why = '';
                          if (placed(sid) >= x.periods) why = `đã đủ ${placed(sid)}/${x.periods} tiết`;
                          else if (!tid) why = 'chưa có giáo viên';
                          else if (teacherElsewhere(tid, pickClass, selCell)) why = `${names.teachers[tid]} ${teacherElsewhere(tid, pickClass, selCell)} lúc này`;
                          else if (onDay(sid, w) + 1 > maxDay) why = `đã có ${maxDay} tiết trong ${WEEKDAY_LONG[w - 1]}`;
                          return { sid, tid, missing: x.periods - placed(sid), why };
                        });
                        return (
                          <div className="card card-outline ta-cell-editor">
                            <div className="ta-cell-head">
                              <div><strong>Lớp {className(pickClass)} · {WEEKDAY_LONG[w - 1]} tiết {p}</strong><span className="caption muted">Đang xếp: {cur}</span></div>
                              <button type="button" className="btn btn-icon" aria-label="Đóng" onClick={() => setSelCell(null)}><Icon name="close" size="sm" /></button>
                            </div>
                            {here.length > 0 && (
                              <ul className="ta-fix-list">
                                {here.map((v, i) => <li key={i} className={v.level === 'error' ? 'is-error' : 'is-warn'}><strong>{problemText(v, names, className)}</strong>{fixHint(v, names) && <span>{fixHint(v, names)}</span>}</li>)}
                              </ul>
                            )}
                            {fixedCell ? <p className="caption muted">Ô cố định ({fixedLabels.get(selCell)}): giữ nguyên ở mọi lớp, không đổi được.</p> : (
                              <>
                                {entry && (
                                  <div className="ta-cell-section">
                                    <span className="field-label">1. Đổi chỗ với tiết khác của lớp <span className="caption muted">(giữ nguyên số tiết mỗi môn – nên dùng)</span></span>
                                    {okSwaps.length === 0 ? <p className="caption muted">Không có ô nào đổi được mà không gây trùng giờ giáo viên.</p> : (
                                      <div className="ta-swap-list">
                                        {okSwaps.map(({ k2, e2 }) => {
                                          const [w2, p2] = cellOf(k2);
                                          return (
                                            <button key={k2} type="button" className="ta-swap-option" onClick={() => { swapCells(pickClass, selCell, k2); setSelCell(k2); }}>
                                              <strong>{WEEKDAY_LONG[w2 - 1]} tiết {p2}</strong>
                                              <span>{e2 ? `${names.subjects[e2.subjectId]} · ${names.teachers[teacherOf(e2.subjectId)] ?? ''}` : 'Ô trống'}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {badSwaps.length > 0 && (
                                      <details className="ta-swap-bad"><summary>{badSwaps.length} ô không đổi được – xem lý do</summary>
                                        <ul className="ta-list">{badSwaps.map(({ k2, e2, why }) => {
                                          const [w2, p2] = cellOf(k2);
                                          return <li key={k2}>{WEEKDAY_LONG[w2 - 1]} tiết {p2} ({e2 ? names.subjects[e2.subjectId] : 'trống'}): {why.join('; ')}.</li>;
                                        })}</ul>
                                      </details>
                                    )}
                                  </div>
                                )}
                                <div className="ta-cell-section">
                                  <label className="field"><span className="field-label">{entry ? '2. Hoặc thay bằng môn khác' : 'Xếp môn vào ô trống này'}</span>
                                    <select className="input" value="" onChange={(e) => { if (e.target.value) setCellSubject(pickClass, selCell, e.target.value); }}>
                                      <option value="">— Chọn môn —</option>
                                      <optgroup label="Xếp được">
                                        {options.filter((o) => !o.why).map((o) => <option key={o.sid} value={o.sid}>{names.subjects[o.sid]} – {names.teachers[o.tid]} · còn thiếu {o.missing} tiết</option>)}
                                      </optgroup>
                                      <optgroup label="Không xếp được">
                                        {options.filter((o) => o.why).map((o) => <option key={o.sid} value={o.sid} disabled>{names.subjects[o.sid]} – {o.why}</option>)}
                                      </optgroup>
                                    </select>
                                    {entry && <span className="field-help">Thay môn thì {names.subjects[entry.subjectId]} sẽ thiếu 1 tiết ({placed(entry.subjectId)}/{need(entry.subjectId)} → {placed(entry.subjectId) - 1}/{need(entry.subjectId)}); cần xếp bù {names.subjects[entry.subjectId]} vào một ô trống khác.</span>}
                                  </label>
                                </div>
                                {entry && form.mode !== 'TIMETABLE' && (() => {
                                  const choices = teacherChoices(pickClass, entry.subjectId);
                                  const ok = choices.filter((t) => !t.current && !t.why);
                                  const bad = choices.filter((t) => !t.current && t.why);
                                  const lessons = placed(entry.subjectId);
                                  return (
                                    <div className="ta-cell-section">
                                      <span className="field-label">3. Hoặc đổi giáo viên {names.subjects[entry.subjectId]} của lớp
                                        <span className="caption muted"> (đổi cho cả {lessons} tiết {names.subjects[entry.subjectId]} của lớp {className(pickClass)} – mỗi lớp – môn chỉ một giáo viên)</span></span>
                                      <p className="caption muted">Số tiết tính cả tuần, ở mọi lớp giáo viên đang dạy (không tính Chào cờ / Sinh hoạt lớp). Thẻ đầu là giáo viên hiện tại để so sánh.</p>
                                      {ok.length === 0 ? <p className="caption muted">Không còn giáo viên {names.subjects[entry.subjectId]} nào rảnh ở mọi tiết này.</p> : (
                                        <div className="ta-swap-list">
                                          {choices.filter((t) => t.current).map((t) => (
                                            <div key={t.tid} className="ta-swap-option ta-teacher-card is-current">{teacherCard(t, `${names.subjects[entry.subjectId]} ${className(pickClass)}`)}</div>
                                          ))}
                                          {ok.map((t) => (
                                            <button key={t.tid} type="button" className="ta-swap-option ta-teacher-card" onClick={() => setTeacher(pickClass, entry.subjectId, t.tid)}
                                              aria-label={`Đổi sang ${t.name}`}>
                                              {teacherCard(t, `${names.subjects[entry.subjectId]} ${className(pickClass)}`)}
                                              <span className="ta-tc-pick">Chọn giáo viên này</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                      {bad.length > 0 && (
                                        <details className="ta-swap-bad"><summary>{bad.length} giáo viên không chọn được – xem lý do</summary>
                                          <ul className="ta-list">{bad.map((t) => <li key={t.tid}>{t.name}: {t.why}.</li>)}</ul>
                                        </details>
                                      )}
                                    </div>
                                  );
                                })()}
                                {entry && (
                                  <div className="ta-cell-actions">
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCellSubject(pickClass, selCell, '')}>Để trống ô này</button>
                                    <span className="caption muted">{names.subjects[entry.subjectId]} sẽ thiếu 1 tiết cho đến khi xếp bù.</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {view === 'teacher' && timetablesNow && (
                    <div className="ta-panel">
                      <select className="input ta-pick" value={pickTeacher} onChange={(e) => setPickTeacher(e.target.value)} aria-label="Giáo viên">
                        {loadsNow.map((l) => <option key={l.teacherId} value={l.teacherId}>{l.name} – {l.load}/{l.norm} tiết</option>)}
                      </select>
                      <Grid grid={resultGrid} cells={teacherCells(pickTeacher)} marks={marksFor((v) => String(v.teacherId) === String(pickTeacher))} />
                      <p className="caption muted">Ô mờ là tiết ở lớp ngoài lần xếp này hoặc giờ đã đánh dấu bận. Sửa ở tab "Theo lớp".</p>
                    </div>
                  )}
                  {view === 'assign' && (
                    <div className="ta-panel ta-table-wrap">
                      <table className="table ta-assign">
                        <thead><tr><th>Lớp</th><th>Môn</th><th>Giáo viên</th><th /></tr></thead>
                        <tbody>
                          {[...assignList].sort((a, b) => className(a.classId).localeCompare(className(b.classId)) || (names.subjects[a.subjectId] ?? '').localeCompare(names.subjects[b.subjectId] ?? '', 'vi')).map((a) => {
                            const o = original.get(`${a.classId}:${a.subjectId}`);
                            const byHand = o && o.teacherId !== a.teacherId;
                            const err = review?.errors.find((v) => v.classId === a.classId && v.subjectId === a.subjectId && ['NOT_QUALIFIED', 'TEACHER_LOCKED', 'TEACHER_UNKNOWN'].includes(v.code));
                            const choices = teacherChoices(a.classId, a.subjectId);
                            return (
                              <tr key={`${a.classId}:${a.subjectId}`} className={err ? 'is-error' : ''}>
                                <td>{className(a.classId)}</td><td>{names.subjects[a.subjectId]}</td>
                                <td>
                                  {draft && form.mode !== 'TIMETABLE' ? (
                                    <select className="input ta-teacher-pick" value={a.teacherId} aria-label={`Giáo viên ${className(a.classId)} – ${names.subjects[a.subjectId]}`}
                                      onChange={(e) => setTeacher(a.classId, a.subjectId, e.target.value)}>
                                      {choices.map((t) => (
                                        <option key={t.tid} value={t.tid} disabled={Boolean(t.why)}>
                                          {t.name}{t.code ? ` (${t.code})` : ''}{t.current ? ` – đang phân công · ${t.now}/${t.norm} tiết` : t.why ? ` – không chọn được: ${t.why}` : ` – rảnh · ${t.now} → ${t.after}/${t.norm} tiết${t.after > t.norm ? ' (vượt định mức)' : ''}`}
                                        </option>
                                      ))}
                                    </select>
                                  ) : names.teachers[a.teacherId]}
                                  {err && <span className="caption tt-red ta-row-error">{problemText(err, names, className)}</span>}
                                </td>
                                <td>{byHand ? <span className="ta-tag is-hand">Sửa tay</span> : o?.kept ? <span className="ta-tag">Giữ nguyên</span> : o?.changed ? <span className="ta-tag is-new">Mới</span> : <span className="ta-tag">Như cũ</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {view === 'load' && (
                    <div className="ta-panel ta-table-wrap">
                      <table className="table">
                        <thead><tr><th>Giáo viên</th><th>Định mức</th><th>Lớp khác</th><th>Tổng</th><th>Vượt</th></tr></thead>
                        <tbody>
                          {loadsNow.map((l) => (
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
                  {view === 'issues' && review && (
                    <div className="ta-panel">
                      {problems.length === 0 && <p className="muted">Không có gì cần chú ý.</p>}
                      {review.errors.length > 0 && <><h3 className="title-sm tt-red">Lỗi phải sửa trước khi áp dụng ({review.errors.length})</h3>
                        <ul className="ta-fix-list">{review.errors.map((v, i) => <li key={i} className="is-error"><strong>{problemText(v, names, className)}</strong>{fixHint(v, names) && <span>{fixHint(v, names)}</span>}<button type="button" className="tt-link" onClick={() => jumpTo(v)}>Đến chỗ lỗi</button></li>)}</ul></>}
                      {review.warnings.length > 0 && <><h3 className="title-sm">Chưa đẹp – không bắt buộc ({review.warnings.length}, điểm phạt {review.score})</h3>
                        <ul className="ta-list ta-problems">{review.warnings.slice(0, 80).map((v, i) => <li key={i}><span>{problemText(v, names, className)}</span> <span className="caption muted">+{v.weight}</span> <button type="button" className="tt-link" onClick={() => jumpTo(v)}>Xem</button></li>)}</ul>
                        {review.warnings.length > 80 && <p className="caption muted">… và {review.warnings.length - 80} mục khác.</p>}</>}
                    </div>
                  )}
                  {view === 'issues' && !review && (
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
                    <button type="button" className="btn btn-primary" onClick={() => { setOverwriteOk(false); setApplyError(null); setConfirm(true); }} disabled={blocking || stale || checkStale}
                      title={checking ? 'Đang kiểm tra lại bản nháp' : blocking ? 'Bản nháp còn lỗi phải sửa' : stale ? 'Thiết lập đã đổi' : undefined}>
                      <Icon name="check" size="sm" /> Áp dụng
                    </button>
                  </div>
                  {blocking && !checking && <p className="caption tt-red">Nút "Áp dụng" đang khoá vì bản nháp còn {review ? review.errors.length : missing} lỗi bắt buộc (danh sách ở khung đỏ phía trên). Sửa hết lỗi thì nút tự mở.</p>}
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
                {edited && <li>Bản nháp đã chỉnh tay {history.length} thao tác; hệ thống kiểm tra lại mọi quy tắc khi lưu.</li>}
                {form.mode !== 'TIMETABLE' && <li>{changed} phân công thay đổi, áp dụng từ {dmy(result.range.start)} đến {dmy(result.range.assignEnd)} (hết năm học).</li>}
                {form.mode !== 'ASSIGN' && <li>Thời khoá biểu {Object.keys(timetablesNow ?? {}).length} lớp từ {dmy(result.range.start)} đến {dmy(result.range.end)}; tiết đã điểm danh được giữ.</li>}
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
