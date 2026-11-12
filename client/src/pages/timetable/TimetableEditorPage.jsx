import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getTimetableEditor, saveClassTimetable } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { clashWhen, dm, dmy, groupClashes, isMorning, WEEKDAY_LONG } from './WeekTimetable.jsx';
import './timetable.css';

// SCR-28 Create Time Table / SCR-30 Update Time Table – UC-71 / UC-73 (FE-10, School Manager), Stitch design.
// The grid is the weekly pattern (Monday..Saturday × periods); a cell opens a small editor (subject + room). Saving
// applies it from "Áp dụng từ" to "Đến": days before stay as they were, periods with attendance are kept, and each
// period takes the teacher assigned to that subject on its date (the grid shows the teacher of `teacherDate`).

const DAYS = [1, 2, 3, 4, 5, 6];
const key = (weekday, slotId) => `${weekday}|${slotId}`;
const toCells = (entries = []) =>
  Object.fromEntries(entries.map((e) => [key(e.weekday, e.slotId), { subjectId: String(e.subjectId), room: e.room ?? '' }]));
const weekdayOf = (iso) => ((new Date(`${iso}T00:00:00`).getDay() + 6) % 7) + 1;

// Small editor anchored in a cell.
function CellEditor({ value, subjects, label, alignRight, onChange, onClose }) {
  const ref = useRef(null);
  const [subjectId, setSubjectId] = useState(value?.subjectId ?? '');
  const [room, setRoom] = useState(value?.room ?? '');
  useEffect(() => {
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector('select')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const apply = (e) => {
    e.preventDefault();
    onChange({ subjectId, room });
    onClose();
  };
  return (
    <form ref={ref} className={`tt-pop${alignRight ? ' is-right' : ''}`} onSubmit={apply} aria-label={label}>
      <span className="label-upper">{label}</span>
      <label className="tt-pop-field">
        <span>Môn học</span>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">— Không có tiết —</option>
          {subjects.map((s) => <option key={s.subjectId} value={s.subjectId}>{s.name}</option>)}
        </select>
      </label>
      <label className="tt-pop-field">
        <span>Phòng học</span>
        <input value={room} maxLength={50} placeholder="Ví dụ: P.204" onChange={(e) => setRoom(e.target.value)} disabled={!subjectId} />
      </label>
      <div className="tt-pop-actions">
        {value?.subjectId && <button type="button" className="btn btn-danger" onClick={() => { onChange({ subjectId: '', room: '' }); onClose(); }}>Xoá tiết</button>}
        <button type="submit" className="btn btn-primary">Xong</button>
      </div>
    </form>
  );
}

export default function TimetableEditorPage() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [cells, setCells] = useState({});
  const [initial, setInitial] = useState({});
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [shift, setShift] = useState('all');
  const [editing, setEditing] = useState(null);
  const [defaults, setDefaults] = useState({ start: '', end: '' });
  const [touched, setTouched] = useState(() => new Set()); // cells edited after the last failed save

  const load = useCallback(async (date) => {
    setLoadError('');
    try {
      const d = await getTimetableEditor(classId, date);
      setData(d);
      const c = toCells(d.shown?.entries);
      setCells(c);
      setInitial(c);
      const min = d.today > d.class.schoolYear.startDate ? d.today : d.class.schoolYear.startDate;
      // Default range: from the shown version's start (or today if it already started) to its end; a version that
      // already ended is re-applied from today to the end of the year.
      const s0 = d.shown && d.shown.startDate > min ? d.shown.startDate : min;
      const e0 = d.shown && d.shown.endDate >= s0 ? d.shown.endDate : d.class.schoolYear.endDate;
      setStart(s0);
      setEnd(e0);
      setDefaults({ start: s0, end: e0 });
      setTouched(new Set());
      const periodOf = Object.fromEntries(d.timeSlots.map((s) => [String(s.slotId), s.period]));
      setShift((d.shown?.entries ?? []).some((e) => periodOf[String(e.slotId)] > 5) ? 'all' : 'am');
      setSaveError(null);
      setEditing(null);
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [classId]);
  useEffect(() => { load(); }, [load]);

  const cellsDirty = JSON.stringify(cells) !== JSON.stringify(initial);
  const dirty = cellsDirty || start !== defaults.start || end !== defaults.end;
  // Unsaved changes: ask before closing the tab or reloading.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const subjectsById = useMemo(() => Object.fromEntries((data?.subjects ?? []).map((s) => [String(s.subjectId), s])), [data]);
  const counts = useMemo(() => {
    const c = {};
    for (const v of Object.values(cells)) if (v.subjectId) c[v.subjectId] = (c[v.subjectId] ?? 0) + 1;
    return c;
  }, [cells]);

  // Problems from the last save: teacher clashes (per cell) and subjects without a teacher on some dates.
  const { clashByCell, noTeacherSubjects } = useMemo(() => {
    const byCell = {};
    const missing = new Set();
    const items = saveError?.details?.items ?? [];
    if (saveError?.code === 'MSG_TIMETABLE_TEACHER_CLASH' && data) {
      for (const p of items) {
        const slot = data.timeSlots.find((s) => s.period === p.period);
        if (!slot) continue;
        const k = key(weekdayOf(p.date), slot.slotId);
        if (touched.has(k)) continue; // already changed by the user
        (byCell[k] ??= []).push(`${p.teacher} dạy ${p.otherClass} (${dm(p.date)})`);
      }
    }
    if (saveError?.code === 'MSG_TIMETABLE_NO_TEACHER') {
      for (const p of items) {
        const s = (data?.subjects ?? []).find((x) => x.name === p.subject);
        if (s) missing.add(String(s.subjectId));
      }
    }
    return { clashByCell: byCell, noTeacherSubjects: missing };
  }, [saveError, data, touched]);

  if (loadError) {
    return (
      <div className="tt-page">
        <div className="notice amber"><Icon name="error_outline" /><div><p>{loadError}</p>
          <Link to="/timetables" className="btn btn-secondary">Về danh sách lớp</Link></div></div>
      </div>
    );
  }
  if (!data) return <div className="tt-page" aria-busy="true"><p className="tt-muted">Đang tải…</p></div>;

  const cls = data.class;
  const creating = data.versions.length === 0;
  const min = data.today > cls.schoolYear.startDate ? data.today : cls.schoolYear.startDate;
  const total = Object.values(cells).filter((v) => v.subjectId).length;
  const planned = data.subjects.reduce((n, s) => n + s.periodsPerWeek, 0);
  const clashSubjects = new Set(Object.keys(clashByCell).map((k) => cells[k]?.subjectId).filter(Boolean));
  // Red = the server refused the save for this subject; amber = no teacher on teacherDate (the server checks every
  // date of the range on save, a teacher may start later inside the range).
  const noTeacher = (sid) => noTeacherSubjects.has(sid);
  const noTeacherToday = (sid) => !subjectsById[sid]?.teacher;
  const problemCount = Object.keys(clashByCell).length
    + Object.entries(cells).filter(([, v]) => v.subjectId && noTeacher(v.subjectId)).length;
  const rangeError = !start ? 'Chọn ngày bắt đầu áp dụng.' : start < min ? `Ngày bắt đầu phải từ ${dmy(min)} trở đi.`
    : end && end < start ? 'Ngày kết thúc phải sau ngày bắt đầu.' : end > cls.schoolYear.endDate || start > cls.schoolYear.endDate
      ? `Thời gian phải nằm trong năm học (đến ${dmy(cls.schoolYear.endDate)}).` : '';
  const periodOf = Object.fromEntries(data.timeSlots.map((s) => [String(s.slotId), s.period]));
  const hidden = shift === 'all' ? 0 : Object.entries(cells)
    .filter(([k, v]) => v.subjectId && (isMorning(periodOf[k.split('|')[1]]) !== (shift === 'am'))).length;
  const groups = [true, false]
    .filter((am) => shift === 'all' || (shift === 'am') === am)
    .map((am) => ({ am, slots: data.timeSlots.filter((s) => isMorning(s.period) === am) }))
    .filter((g) => g.slots.length);

  const setCell = (k, v) => {
    setTouched((t) => new Set(t).add(k));
    setCells((c) => {
      const next = { ...c };
      if (v.subjectId) next[k] = { subjectId: String(v.subjectId), room: v.room ?? '' };
      else delete next[k];
      return next;
    });
  };

  async function save() {
    if (rangeError) return;
    if (total === 0 && !window.confirm(`Mẫu thời khoá biểu đang trống. Lưu sẽ xoá các tiết chưa điểm danh của lớp ${cls.className} từ ${dmy(start)} đến ${dmy(end || cls.schoolYear.endDate)}. Tiếp tục?`)) return;
    setSaving(true);
    setSaveError(null);
    setTouched(new Set());
    const entries = Object.entries(cells)
      .filter(([, v]) => v.subjectId)
      .map(([k, v]) => {
        const [weekday, slotId] = k.split('|');
        return { weekday: Number(weekday), slotId: Number(slotId), subjectId: Number(v.subjectId), room: v.room.trim() || undefined };
      });
    try {
      const r = await saveClassTimetable(classId, { startDate: start, endDate: end, entries, stamp: data.stamp });
      toast(`Đã lưu thời khoá biểu lớp ${cls.className} từ ${dmy(r.startDate)} đến ${dmy(r.endDate)}: tạo ${r.generated} tiết${r.kept ? `, giữ ${r.kept} tiết đã điểm danh` : ''}.`);
      await load(r.startDate);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }
  function cancel() {
    if (dirty) {
      setCells(initial); setStart(defaults.start); setEnd(defaults.end); setSaveError(null); setEditing(null); setTouched(new Set());
    } else navigate('/timetables');
  }

  const problems = saveError?.code === 'MSG_TIMETABLE_TEACHER_CLASH' ? groupClashes(saveError.details?.items) : saveError?.details?.items;

  return (
    <div className="tt-page tt-page-wide">
      <nav className="tt-crumb" aria-label="Breadcrumb">
        <span>EduConnect</span><span className="tt-crumb-sep">/</span><span>Đào tạo</span><span className="tt-crumb-sep">/</span>
        <Link to="/timetables">Thời khoá biểu</Link><span className="tt-crumb-sep">/</span>
        {creating ? <strong className="tt-ink">Tạo mới TKB</strong> : <><span>Lớp {cls.className}</span><span className="tt-crumb-sep">/</span><strong className="tt-ink">Sửa</strong></>}
      </nav>
      <div className="tt-head">
        <div>
          <div className="tt-title-row">
            <h1 className="headline-lg">{creating ? 'Tạo' : 'Cập nhật'} thời khoá biểu – Lớp {cls.className}</h1>
            {dirty && <span className="tt-tag-draft"><i />Bản thảo chưa lưu</span>}
          </div>
          <p>Năm học {cls.schoolYear.name} · Khối {cls.gradeName} · {cls.trackName} (Áp dụng từ {dmy(start)})</p>
        </div>
        {!data.ended && (
          <div className="tt-head-actions">
            <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>{dirty ? 'Huỷ thay đổi' : 'Huỷ'}</button>
            <button type="button" className="btn btn-primary" disabled={saving || !!rangeError} onClick={save} title={rangeError || undefined}>
              <Icon name={creating ? 'done_all' : 'check'} size="sm" /> {saving ? 'Đang lưu…' : creating ? 'Lưu TKB' : 'Lưu thay đổi'}
            </button>
          </div>
        )}
      </div>

      <div className="tt-callout">
        <span><Icon name="info" size="sm" /><strong>Lưu ý:</strong> Thay đổi hiện ngay trên TKB lớp và lịch dạy của giáo viên liên quan. Trước {dmy(start)} giữ nguyên, tiết đã điểm danh không đổi.</span>
        {!creating && <Link to={`/timetable?classId=${cls.classId}`} className="tt-link">Xem theo tuần</Link>}
      </div>
      {data.ended && <div className="notice amber"><Icon name="lock" /><p>Năm học đã kết thúc nên chỉ xem được thời khoá biểu.</p></div>}

      <div className="tt-edit-layout">
        <div className="tt-edit-main">
          <div className="tt-edit-toolbar">
            <div className="tt-edit-shift">
              <span className="label-upper">Hiển thị ca:</span>
              <div className="tt-seg is-small" role="tablist" aria-label="Ca học">
                {[['all', 'Cả ngày (1–10)'], ['am', 'Buổi sáng (1–5)'], ['pm', 'Buổi chiều (6–10)']].map(([k, t]) => (
                  <button key={k} type="button" role="tab" aria-selected={shift === k} onClick={() => setShift(k)}>{t}</button>
                ))}
              </div>
            </div>
            <div className="tt-edit-range">
              <label>Áp dụng từ
                <input type="date" value={start} min={min} max={cls.schoolYear.endDate} disabled={data.ended} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label>đến
                <input type="date" value={end} min={start || min} max={cls.schoolYear.endDate} disabled={data.ended} onChange={(e) => setEnd(e.target.value)} />
              </label>
              {problemCount > 0 && <span className="tt-conflicts"><i />{problemCount} ô cần xử lý</span>}
              {rangeError && !data.ended && <span className="tt-range-error" role="alert">{rangeError}</span>}
            </div>
          </div>

          {hidden > 0 && (
            <p className="tt-hidden-note caption">
              <Icon name="visibility_off" size="sm" />Đang ẩn {hidden} tiết của buổi {shift === 'am' ? 'chiều' : 'sáng'}; các tiết này vẫn được lưu.
              <button type="button" className="tt-link" onClick={() => setShift('all')}>Hiện cả ngày</button>
            </p>
          )}
          <div className="tt-sheet">
            <div className="tt-sheet-head">
              <span><Icon name="calendar_view_week" size="sm" /><strong>Bảng phân bổ tiết học tuần</strong></span>
              <span className="caption tt-muted">GVCN: <strong>{cls.homeroomTeacher ?? 'Chưa phân công'}</strong> · Giáo viên tính tại ngày {dmy(data.teacherDate)}</span>
            </div>
            <div className="tt-sheet-scroll">
              <table className="tt-egrid">
                <thead>
                  <tr>
                    <th scope="col" className="tt-egrid-corner">Tiết</th>
                    {DAYS.map((d) => <th key={d} scope="col">{WEEKDAY_LONG[d - 1]}</th>)}
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={String(g.am)}>
                    <tr className="tt-band">
                      <td colSpan={7}>
                        <span>Buổi {g.am ? 'sáng' : 'chiều'} · {g.slots[0].start} – {g.slots.at(-1).end}</span>
                        <span className="caption">{g.slots.length} tiết</span>
                      </td>
                    </tr>
                    {g.slots.map((s) => (
                      <tr key={s.slotId}>
                        <th scope="row"><span className="tt-period">Tiết {s.period}</span><span className="tt-time">{s.start}–{s.end}</span></th>
                        {DAYS.map((d) => {
                          const k = key(d, s.slotId);
                          const v = cells[k];
                          const old = initial[k];
                          const sub = v ? subjectsById[v.subjectId] : null;
                          const changed = (v?.subjectId ?? '') !== (old?.subjectId ?? '') || (v?.room ?? '') !== (old?.room ?? '');
                          const clash = clashByCell[k];
                          const missing = v && noTeacher(v.subjectId);
                          const warn = v && !missing && noTeacherToday(v.subjectId);
                          const label = `${WEEKDAY_LONG[d - 1]}, tiết ${s.period}`;
                          return (
                            <td key={d} className={editing === k ? 'is-editing' : undefined}>
                              {v ? (
                                <button type="button" disabled={data.ended} onClick={() => setEditing(k)} aria-label={`${label}: ${sub?.name ?? ''}`}
                                  className={`tt-ecard${clash || missing ? ' is-bad' : warn ? ' is-warn' : ''}${changed ? ' is-changed' : ''}`}>
                                  <span className="tt-ecard-top">
                                    <strong>{sub?.name ?? 'Môn không còn trong loại lớp'}</strong>
                                    {clash || missing ? <Icon name={clash ? 'error' : 'warning'} size="sm" />
                                      : changed ? <span className="tt-tag-new">{old ? 'Vừa sửa' : 'Vừa thêm'}</span>
                                        : v.room ? <span className="tt-ecard-room">{v.room}</span> : null}
                                  </span>
                                  <span className={`tt-ecard-teacher${missing ? ' is-missing' : warn ? ' is-warn' : ''}`}>
                                    {sub?.teacher ? sub.teacher.teacherName : `Chưa có GV ngày ${dm(data.teacherDate)}`}
                                  </span>
                                  {clash && <span className="tt-pen">* Trùng lịch: {clash[0]}{clash.length > 1 ? ` (+${clash.length - 1})` : ''}</span>}
                                  {!clash && missing && <span className="tt-pen">* Chưa phân công giáo viên</span>}
                                  {!clash && !missing && changed && old && old.subjectId !== v.subjectId && (
                                    <span className="tt-swap"><s>{subjectsById[old.subjectId]?.name}</s><Icon name="arrow_forward" size="sm" /><em>{sub?.name}</em></span>
                                  )}
                                </button>
                              ) : (
                                <button type="button" className={`tt-eempty${old ? ' is-removed' : ''}`} disabled={data.ended} onClick={() => setEditing(k)} aria-label={`${label}: chọn môn`}>
                                  {old ? <span><s>{subjectsById[old.subjectId]?.name}</s> · đã xoá</span> : <span><Icon name="add" size="sm" />Chọn môn</span>}
                                </button>
                              )}
                              {editing === k && (
                                <CellEditor value={v} subjects={data.subjects} label={label} alignRight={d >= 5}
                                  onChange={(nv) => setCell(k, nv)} onClose={() => setEditing(null)} />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            <div className="tt-sheet-foot caption">
              <span><Icon name="touch_app" size="sm" />Bấm vào ô để chọn môn và phòng · Esc để đóng</span>
              <span className="tt-ink"><Icon name="info" size="sm" />Giáo viên mỗi tiết lấy theo phân công giảng dạy của ngày học</span>
            </div>
          </div>

          {saveError && (
            <div className="tt-pen-callout" role="alert">
              <Icon name="draw" />
              <div>
                <strong>{errorText(saveError)}</strong>
                {saveError.code === 'MSG_TIMETABLE_STALE' && (
                  <button type="button" className="btn btn-secondary tt-reload" onClick={() => load()}>Tải lại thời khoá biểu</button>
                )}
                {problems && (
                  <ul>
                    {problems.map((p, i) => (
                      <li key={i}>
                        {p.teacher
                          ? `${clashWhen(p)}${p.subject ? ` – ${p.subject}` : ''}: ${p.teacher} đang dạy lớp ${p.otherClass}`
                          : `${p.subject}: chưa có giáo viên từ ${dmy(p.from)} đến ${dmy(p.to)} (${p.periods} tiết)`}
                      </li>
                    ))}
                  </ul>
                )}
                {problems?.some((p) => !p.teacher) && (
                  <Link to="/teaching-assignments" className="tt-link"><Icon name="co_present" size="sm" /> Phân công giáo viên cho các môn còn thiếu</Link>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="tt-side">
          <div className="card tt-quota">
            <div className="tt-quota-head">
              <h2 className="title-sm">Số tiết đã xếp / Yêu cầu</h2>
              <span className={`tt-quota-chip${total === planned ? ' is-ok' : ''}`}>{total} / {planned} tiết</span>
            </div>
            <div className="tt-progress"><i style={{ width: `${planned ? Math.min(100, (total / planned) * 100) : 0}%` }} /></div>
            <ul className="tt-quota-list">
              {data.subjects.map((s) => {
                const sid = String(s.subjectId);
                const n = counts[sid] ?? 0;
                const bad = clashSubjects.has(sid) ? 'Trùng lịch' : noTeacher(sid) && n > 0 ? 'Chưa có GV' : null;
                const warnText = !bad && n > 0 && noTeacherToday(sid) ? 'Chưa có GV' : null;
                const state = bad ? 'bad' : warnText || n !== s.periodsPerWeek ? 'warn' : 'ok';
                const text = bad ?? warnText ?? (n === s.periodsPerWeek ? 'Đủ' : n < s.periodsPerWeek ? `Thiếu ${s.periodsPerWeek - n}` : `Thừa ${n - s.periodsPerWeek}`);
                return (
                  <li key={s.subjectId}>
                    <Icon name={state === 'ok' ? 'check_circle' : state === 'bad' ? 'warning' : 'pending'} size="sm" className={`tt-q-${state}`} />
                    <span className="tt-quota-name">
                      <strong>{s.name}</strong>
                      <span className={`caption${s.teacher ? ' tt-muted' : ' tt-red'}`}>
                        {s.teacher ? `${s.teacher.teacherName}${s.teacher.endDate < cls.schoolYear.endDate ? ` (đến ${dm(s.teacher.endDate)})` : ''}` : 'Chưa phân công giáo viên'}
                      </span>
                    </span>
                    <span className="tt-quota-n">{n} / {s.periodsPerWeek} tiết</span>
                    <span className={`tt-q-pill tt-q-${state}`}>{text}</span>
                  </li>
                );
              })}
            </ul>
            <Link to="/teaching-assignments" className="tt-link"><Icon name="co_present" size="sm" /> Mở phân công giảng dạy</Link>
          </div>

          {data.versions.length > 0 && (
            <div className="card tt-versions">
              <div className="tt-quota-head">
                <span className="label-upper">Nhật ký phiên bản</span>
                <span className="caption tt-muted">Lớp {cls.className}</span>
              </div>
              <ol>
                {[...data.versions].reverse().map((v) => {
                  const on = data.shown?.timetableId === v.timetableId;
                  const running = v.startDate <= data.today && v.endDate >= data.today;
                  const past = v.endDate < data.today;
                  return (
                    <li key={v.timetableId} className={past && !on ? 'is-past' : undefined}>
                      <span className={`tt-v-icon${on ? ' is-on' : ''}`}><Icon name={on ? 'edit' : running ? 'verified' : 'history'} size="sm" /></span>
                      <button type="button" className="tt-v-body" disabled={on}
                        onClick={() => (!dirty || window.confirm('Bỏ các thay đổi chưa lưu?')) && load(v.startDate)}>
                        <span className="tt-v-title">
                          <strong>{dm(v.startDate)} – {dmy(v.endDate)}</strong>
                          {on && <span className="tt-ink caption">Đang mở</span>}
                        </span>
                        {running && <span className="stamp">Đang áp dụng</span>}
                        <span className="caption tt-muted">{v.periodsPerWeek} tiết/tuần</span>
                        <span className="caption tt-faint">{v.createdAt ? `${dmy(v.createdAt.slice(0, 10))} ${v.createdAt.slice(11)}` : ''}{v.createdBy ? ` · ${v.createdBy}` : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
