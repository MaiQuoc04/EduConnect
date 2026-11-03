import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getTeachingBoard, saveTeachingAssignments } from '../../api/teachingAssignments.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import { foldVietnamese } from '../../utils/teacherValidation.js';
import './HomeroomAssignmentPage.css'; // shared toolbar / save bar styles (hr-*)
import './TeachingAssignmentPage.css';

const keyOf = (classId, subjectId) => `${classId}:${subjectId}`;
const idOf = (v) => (v == null || v === '' ? null : String(v));
const fold = (v = '') => foldVietnamese(v); // accent-insensitive search, same rule as the server

// ── Teacher picker popover (fixed position so the scrolling matrix does not clip it) ──
function CellPicker({ anchor, cell, teachers, loads, onPick, onUndo, onClose }) {
  const ref = useRef(null);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const width = 320;
    const height = ref.current?.offsetHeight ?? 360;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = r.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 4) : below;
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    ref.current?.querySelector('input')?.focus();
    const onDown = (e) => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { onClose(); anchor.focus(); } };
    const onScroll = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  const q = fold(query.trim());
  const list = teachers.filter((t) => !q || fold(t.fullName).includes(q) || fold(t.teacherCode).includes(q));

  return (
    <div className="ta-picker" ref={ref} style={{ top: pos.top, left: pos.left }} role="dialog" aria-label={`Chọn giáo viên ${cell.className} – ${cell.subjectName}`}>
      <div className="ta-picker-head">
        <div className="ta-picker-title">{cell.className} · {cell.subjectName}</div>
        <div className="ta-picker-sub">{cell.periods} tiết/tuần · chỉ hiện giáo viên đã đăng ký dạy môn này</div>
      </div>
      <input className="ta-picker-search" placeholder="Tìm giáo viên…" value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); onPick(list[0].teacherId); } }} />
      <div className="ta-picker-list" role="listbox">
        {teachers.length === 0 && (
          <div className="ta-picker-empty">
            Chưa có giáo viên nào đăng ký dạy {cell.subjectName}. Cập nhật môn chuyên môn trong hồ sơ giáo viên.
          </div>
        )}
        {teachers.length > 0 && list.length === 0 && <div className="ta-picker-empty">Không tìm thấy giáo viên phù hợp.</div>}
        {list.map((t) => {
          const load = loads[t.teacherId] ?? { periods: 0, classes: 0 };
          const selected = t.teacherId === cell.value;
          return (
            <button key={t.teacherId} type="button" role="option" aria-selected={selected}
              className={`ta-picker-item${selected ? ' is-selected' : ''}`} onClick={() => onPick(t.teacherId)}>
              <span className="ta-picker-name">
                {t.fullName}
                {selected && <Icon name="check" size="sm" />}
              </span>
              <span className="ta-picker-meta">
                {t.teacherCode}{t.department ? ` · ${t.department}` : ''}
              </span>
              <span className="ta-picker-load">{load.periods} tiết/tuần · {load.classes} lớp</span>
            </button>
          );
        })}
      </div>
      <div className="ta-picker-foot">
        {cell.changed && (
          <button type="button" className="hr-inline-btn ta-link" onClick={onUndo}>Hoàn tác ô này</button>
        )}
        {cell.value && (
          <button type="button" className="ta-link ta-link--red" onClick={() => onPick(null)}>Bỏ phân công</button>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
// SCR-17 Teaching Assignment (UC-18): one teacher per (class, subject); a teacher only teaches subjects registered
// in teacher_subjects; changes apply from the chosen date and move the not-yet-attended timetable periods.
export default function TeachingAssignmentPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusTeacher = searchParams.get('teacherId');
  const [board, setBoard] = useState(null);
  const [draft, setDraft] = useState({}); // "classId:subjectId" -> teacherId|null
  const [grade, setGrade] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyTodo, setOnlyTodo] = useState(searchParams.get('status') === 'todo');
  const [picker, setPicker] = useState(null); // { anchor, classId, subjectId }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (params = {}) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getTeachingBoard(params);
      setBoard(data);
      setDraft({});
      setSaveError(null);
      setPicker(null);
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const teacherById = useMemo(() => Object.fromEntries((board?.teachers ?? []).map((t) => [String(t.teacherId), {
    ...t, teacherId: String(t.teacherId), subjectIds: t.subjectIds.map(String),
  }])), [board]);

  // Saved teacher of each cell on the view date (if several rows overlap, the latest start wins).
  const saved = useMemo(() => {
    const map = {};
    for (const a of board?.assignments ?? []) map[keyOf(a.classId, a.subjectId)] = String(a.teacherId);
    return map;
  }, [board]);
  const valueOf = useCallback((k) => (k in draft ? draft[k] : saved[k] ?? null), [draft, saved]);

  const classes = useMemo(() => (board?.classes ?? []).map((c) => ({ ...c, classId: String(c.classId) })), [board]);
  const subjects = useMemo(() => (board?.subjects ?? []).map((s) => ({ ...s, subjectId: String(s.subjectId) })), [board]);
  const subjectById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.subjectId, s])), [subjects]);

  const stateOf = useCallback((k) => {
    const tid = valueOf(k);
    if (!tid) return 'empty';
    return teacherById[tid]?.status === 'LOCKED' ? 'locked' : 'ok';
  }, [valueOf, teacherById]);

  // Weekly load per teacher after pending changes (periods from the class's track).
  const loads = useMemo(() => {
    const map = {};
    for (const c of classes) {
      for (const [sid, periods] of Object.entries(c.subjects)) {
        const tid = valueOf(keyOf(c.classId, sid));
        if (!tid) continue;
        const l = (map[tid] ??= { periods: 0, classSet: new Set() });
        l.periods += periods;
        l.classSet.add(c.classId);
      }
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { periods: v.periods, classes: v.classSet.size }]));
  }, [classes, valueOf]);

  const changes = useMemo(() => Object.entries(draft)
    .filter(([k, v]) => v !== (saved[k] ?? null))
    .map(([k, v]) => { const [classId, subjectId] = k.split(':'); return { classId, subjectId, teacherId: v, previousTeacherId: saved[k] ?? null }; }),
  [draft, saved]);
  const dirty = changes.length > 0;

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const editable = board?.date && board.date >= board.today;

  function setCell(k, teacherId) {
    setSaveError(null);
    setDraft((d) => {
      const next = { ...d };
      if ((saved[k] ?? null) === teacherId) delete next[k];
      else next[k] = teacherId;
      return next;
    });
  }

  function confirmDiscard() {
    return !dirty || window.confirm('Bỏ các thay đổi chưa lưu?');
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const data = await saveTeachingAssignments({
        schoolYearId: Number(board.schoolYear.id),
        date: board.date,
        changes: changes.map((c) => ({
          classId: Number(c.classId),
          subjectId: Number(c.subjectId),
          teacherId: c.teacherId ? Number(c.teacherId) : null,
          previousTeacherId: c.previousTeacherId ? Number(c.previousTeacherId) : null,
        })),
      });
      setBoard(data);
      setDraft({});
      setPicker(null);
      toast(`Đã lưu ${changes.length} thay đổi phân công, áp dụng từ ${formatDate(data.date)}.`);
    } catch (err) {
      setSaveError({ text: errorText(err), stale: err.code === 'MSG_ASSIGNMENT_STALE' });
    } finally {
      setSaving(false);
    }
  }

  // Filters
  const grades = useMemo(() => {
    const m = new Map();
    for (const c of classes) m.set(c.gradeLevel, (m.get(c.gradeLevel) ?? 0) + 1);
    return [...m.entries()];
  }, [classes]);
  const q = fold(search.trim());
  const visible = classes.filter((c) => {
    if (grade !== 'all' && c.gradeLevel !== grade) return false;
    if (q && !fold(c.className).includes(q)) return false;
    const keys = Object.keys(c.subjects).map((sid) => keyOf(c.classId, sid));
    if (onlyTodo && !keys.some((k) => stateOf(k) !== 'ok' || k in draft)) return false;
    if (focusTeacher && !keys.some((k) => valueOf(k) === focusTeacher || saved[k] === focusTeacher)) return false;
    return true;
  });
  // Only columns used by the visible classes
  const columns = subjects.filter((s) => visible.some((c) => s.subjectId in c.subjects));

  // Totals (whole year, after pending changes)
  let totalCells = 0;
  let assigned = 0;
  let todo = 0;
  let periods = 0;
  for (const c of classes) {
    for (const [sid, p] of Object.entries(c.subjects)) {
      const st = stateOf(keyOf(c.classId, sid));
      totalCells += 1;
      if (st === 'ok') { assigned += 1; periods += p; } else todo += 1;
    }
  }
  const emptyChanges = changes.filter((c) => !c.teacherId).length;

  const pickerCell = picker && (() => {
    const k = keyOf(picker.classId, picker.subjectId);
    const cls = classes.find((c) => c.classId === picker.classId);
    return {
      key: k,
      className: cls.className,
      subjectName: subjectById[picker.subjectId]?.name,
      periods: cls.subjects[picker.subjectId],
      value: valueOf(k),
      changed: k in draft,
    };
  })();
  const qualified = pickerCell
    ? Object.values(teacherById)
      .filter((t) => t.subjectIds.includes(picker.subjectId) && (board.rules.lockedTeacherAllowed || t.status !== 'LOCKED'))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
    : [];

  const yearLabel = board?.schoolYear?.name?.replace('-', '–') ?? '';
  const focusName = focusTeacher && teacherById[focusTeacher]?.fullName;

  return (
    <div className="ta-page">
      <div className="ta-head">
        <div>
          <nav className="hr-breadcrumb" aria-label="Breadcrumb">
            <span>EduConnect</span><span>/</span><span>Hồ sơ</span><span>/</span><span>Phân công</span><span>/</span>
            <strong>Giảng dạy</strong>
            <span className="stamp-badge">SCR-17</span>
          </nav>
          <h1 className="headline-lg ta-title">Phân công giảng dạy{yearLabel ? ` – ${yearLabel}` : ''}</h1>
          <p className="ta-subtitle">Ma trận giáo viên bộ môn theo từng lớp. Mỗi ô là một môn của lớp theo cơ cấu của ban.</p>
        </div>
        {board?.schoolYear && (
          <div className="ta-metrics">
            <div>
              <span className="label-upper">Tiến độ phân bổ</span>
              <span className="ta-metric-value">{assigned}<span>/{totalCells} ô</span></span>
            </div>
            <div className="ta-metric-sep" />
            <div>
              <span className="label-upper">Cần xử lý</span>
              <span className={`ta-metric-todo${todo ? '' : ' is-done'}`}>
                <span className="ta-dot" />{todo ? `${todo} ô trống / GV đã khoá` : 'Đã đủ'}
              </span>
            </div>
          </div>
        )}
      </div>

      {board?.schoolYears?.length > 0 && (
        <div className="ta-scope">
          <div className="select-wrap">
            <select value={String(board.schoolYear?.id ?? '')} aria-label="Năm học"
              onChange={(e) => confirmDiscard() && load({ schoolYearId: e.target.value })}>
              {board.schoolYears.map((y) => (
                <option key={y.id} value={String(y.id)}>Năm học {y.name}{y.isCurrent ? ' (hiện tại)' : ''}</option>
              ))}
            </select>
            <Icon name="expand_more" className="select-icon" />
          </div>
          <label className="ta-date">
            <span>Áp dụng từ ngày</span>
            <input type="date" value={board.date ?? ''}
              min={board.schoolYear?.startDate} max={board.schoolYear?.endDate}
              onChange={(e) => e.target.value && confirmDiscard() && load({ schoolYearId: board.schoolYear.id, date: e.target.value })} />
          </label>
          <span className="ta-scope-note">
            {editable
              ? `Ma trận hiển thị phân công ngày ${formatDate(board.date)}; thay đổi có hiệu lực từ ngày này đến hết năm học.`
              : `Ngày ${formatDate(board.date)} đã qua – chỉ xem. Chọn từ hôm nay trở đi để thay đổi.`}
          </span>
        </div>
      )}

      <div className="ta-rule">
        <Icon name="info" />
        <span>
          <strong>Quy tắc:</strong> mỗi lớp – môn có đúng một giáo viên; chỉ chọn được giáo viên đã đăng ký dạy môn đó.
          Tiết đã điểm danh giữ nguyên giáo viên cũ, các tiết sau chuyển sang giáo viên mới.
        </span>
        <span className="ta-legend">
          <span><i className="ta-sw ta-sw--ok" />Đã phân công</span>
          <span><i className="ta-sw ta-sw--empty" />Chưa có GV</span>
          <span><i className="ta-sw ta-sw--locked" />GV đã khoá</span>
          <span><i className="ta-sw ta-sw--changed" />Chưa lưu</span>
        </span>
      </div>

      {loadError && (
        <div className="hr-error"><Icon name="error_outline" /> {loadError}
          <button type="button" className="btn btn-secondary" onClick={() => load()}>Thử lại</button>
        </div>
      )}
      {board && !board.schoolYear && <div className="hr-empty-card"><Icon name="event_busy" /> Chưa có năm học nào được tạo.</div>}

      {board?.schoolYear && (
        <>
          <div className="ta-toolbar">
            <div className="hr-tabs" role="tablist" aria-label="Khối">
              <button type="button" role="tab" aria-selected={grade === 'all'} className={`hr-tab${grade === 'all' ? ' is-active' : ''}`} onClick={() => setGrade('all')}>Tất cả khối</button>
              {grades.map(([g]) => (
                <button key={g} type="button" role="tab" aria-selected={grade === g} className={`hr-tab${grade === g ? ' is-active' : ''}`} onClick={() => setGrade(g)}>Khối {g}</button>
              ))}
            </div>
            <div className="ta-search">
              <Icon name="search" />
              <input placeholder="Tìm lớp (vd: 10A1)…" value={search} maxLength={20} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm lớp" />
            </div>
            <label className="ta-check">
              <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
              Chỉ lớp cần xử lý
            </label>
            {focusTeacher && (
              <span className="ta-focus">
                <Icon name="person_search" size="sm" /> Đang xem lớp của {focusName ?? 'giáo viên'}
                <button type="button" aria-label="Bỏ lọc giáo viên" onClick={() => { const n = new URLSearchParams(searchParams); n.delete('teacherId'); setSearchParams(n, { replace: true }); }}>
                  <Icon name="close" size="sm" />
                </button>
              </span>
            )}
          </div>

          <div className={`ta-card${loading ? ' is-loading' : ''}`}>
            <div className="ta-scroll">
              <table className="ta-table">
                <thead>
                  <tr>
                    <th className="ta-sticky">Lớp</th>
                    {columns.map((s) => <th key={s.subjectId}>{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td className="hr-empty" colSpan={columns.length + 1}>
                      <Icon name="filter_alt_off" />
                      {classes.length === 0 ? 'Năm học này chưa có lớp nào.' : 'Không có lớp nào khớp bộ lọc.'}
                    </td></tr>
                  ) : visible.map((c) => (
                    <tr key={c.classId}>
                      <th scope="row" className="ta-sticky ta-classcell">
                        <div><span className="ta-classname">{c.className}</span><span className="ta-track">{c.trackName}</span></div>
                        <span className="ta-size">Sĩ số: {c.studentCount}</span>
                      </th>
                      {columns.map((s) => {
                        const periodsPw = c.subjects[s.subjectId];
                        if (periodsPw == null) return <td key={s.subjectId} className="ta-na" title="Lớp không học môn này">—</td>;
                        const k = keyOf(c.classId, s.subjectId);
                        const tid = valueOf(k);
                        const t = tid ? teacherById[tid] : null;
                        const st = stateOf(k);
                        const changed = k in draft;
                        const dim = focusTeacher && tid !== focusTeacher && saved[k] !== focusTeacher;
                        const isOpen = picker && picker.classId === c.classId && picker.subjectId === s.subjectId;
                        return (
                          <td key={s.subjectId} className={dim ? 'is-dim' : undefined}>
                            <button type="button"
                              className={`ta-cell ta-cell--${st}${changed ? ' is-changed' : ''}${isOpen ? ' is-open' : ''}${focusTeacher && (tid === focusTeacher || saved[k] === focusTeacher) ? ' is-focus' : ''}`}
                              disabled={!editable}
                              aria-haspopup="dialog"
                              aria-label={`${c.className} – ${s.name}: ${t ? t.fullName : 'chưa có giáo viên'}`}
                              onClick={(e) => setPicker(isOpen ? null : { anchor: e.currentTarget, classId: c.classId, subjectId: s.subjectId })}>
                              {st === 'empty' ? (
                                <span className="ta-cell-body">
                                  <span className="ta-cell-name"><b className="ta-empty-tag">Trống</b> Chọn GV</span>
                                  <span className="ta-cell-sub">Cần bố trí {periodsPw} tiết/tuần</span>
                                </span>
                              ) : (
                                <span className="ta-cell-body">
                                  <span className={`ta-cell-name${st === 'locked' ? ' ta-strike' : ''}`}>{t?.fullName ?? 'Không rõ'}</span>
                                  <span className="ta-cell-sub">
                                    {st === 'locked' ? 'Tài khoản đã khoá – cần thay' : `${t?.teacherCode ?? ''} · ${periodsPw} tiết/tuần`}
                                  </span>
                                </span>
                              )}
                              <Icon name={st === 'locked' ? 'lock' : st === 'empty' ? 'add_circle' : 'expand_more'} size="sm" />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hr-table-foot ta-foot">
              <span>Hiển thị {visible.length} / {classes.length} lớp</span>
              <span>Tổng {periods} tiết/tuần đã phân công (cả năm học)</span>
            </div>
          </div>

          {editable && (
            <div className="hr-savebar">
              {saveError && (
                <div className="form-error ta-save-error" role="alert">
                  <Icon name="error" size="sm" /><span>{saveError.text}</span>
                  {saveError.stale && <button type="button" className="hr-inline-btn" onClick={() => load({ schoolYearId: board.schoolYear.id, date: board.date })}>Tải lại dữ liệu</button>}
                </div>
              )}
              <div className="hr-savebar-info">
                <Icon name="edit_note" />
                <span>
                  {dirty ? (
                    <>
                      <strong>{changes.length}</strong> thay đổi chưa lưu, áp dụng từ {formatDate(board.date)}
                      {emptyChanges > 0 && <span className="hr-todo"> · gồm {emptyChanges} ô bỏ trống</span>}
                    </>
                  ) : 'Chưa có thay đổi. Bấm vào một ô để chọn giáo viên.'}
                </span>
              </div>
              <div className="hr-savebar-actions">
                <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => { setDraft({}); setSaveError(null); }}>Huỷ thay đổi</button>
                <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={handleSave}>
                  <Icon name="save" size="sm" /> {saving ? 'Đang lưu…' : `Lưu phân công${dirty ? ` (${changes.length})` : ''}`}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {loading && !board && <div className="hr-table-card hr-skeleton" style={{ height: 360 }} aria-busy="true" aria-label="Đang tải" />}

      {pickerCell && (
        <CellPicker
          anchor={picker.anchor}
          cell={pickerCell}
          teachers={qualified}
          loads={loads}
          onPick={(tid) => { setCell(pickerCell.key, tid); setPicker(null); }}
          onUndo={() => { setDraft((d) => { const n = { ...d }; delete n[pickerCell.key]; return n; }); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {focusTeacher && board && !teacherById[focusTeacher] && (
        <p className="ta-scope-note">Không tìm thấy giáo viên cần xem. <Link to="/teaching-assignments">Xem tất cả</Link></p>
      )}
    </div>
  );
}
