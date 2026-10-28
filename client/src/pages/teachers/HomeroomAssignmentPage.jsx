import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getHomeroomBoard, saveHomeroomAssignments } from '../../api/homeroom.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import './HomeroomAssignmentPage.css';

const STATUS_LABELS = { ok: 'Đang phụ trách', unassigned: 'Chưa có GVCN', locked: 'GVCN đã khoá' };
const byName = (a, b) => a.fullName.localeCompare(b.fullName, 'vi');
const idOf = (v) => (v == null || v === '' ? null : String(v));

function teacherLabel(t) {
  return `${t.fullName} (${t.teacherCode})${t.subjects ? ` – ${t.subjects}` : ''}`;
}

// ── One class row ───────────────────────────────────────────────────────────
function ClassRow({ cls, original, value, teacherById, holders, rules, onChange }) {
  const [replacing, setReplacing] = useState(false);
  const current = value ? teacherById[value] : null;
  const changed = original !== value;
  const status = !current ? 'unassigned' : current.status === 'LOCKED' ? 'locked' : 'ok';
  const previous = changed && original ? teacherById[original] : null;

  // Teachers that can be chosen for this class: active (unless locked ones are allowed), sorted by name.
  // Teachers already at the per-teacher limit with other classes are listed but disabled.
  const groups = useMemo(() => {
    const free = [];
    const busy = [];
    for (const t of Object.values(teacherById)) {
      if (!rules.lockedTeacherAllowed && t.status === 'LOCKED') continue;
      const others = (holders[t.teacherId] ?? []).filter((c) => c.classId !== cls.classId);
      (others.length ? busy : free).push({ ...t, others });
    }
    return { free: free.sort(byName), busy: busy.sort(byName) };
  }, [teacherById, holders, rules, cls.classId]);

  const showLockedBox = status === 'locked' && !replacing && !changed;

  return (
    <tr className={`hr-row hr-row--${status}${changed ? ' hr-row--changed' : ''}`}>
      <td className="hr-class">{cls.className}</td>
      <td className="hr-muted">Khối {cls.gradeLevel} · {cls.trackName}</td>
      <td className="hr-right hr-num">{cls.studentCount} học sinh</td>
      <td className="hr-teacher-cell">
        {showLockedBox ? (
          <div className="hr-locked-box">
            <div className="hr-locked-name">
              <Link to={`/teachers/${current.teacherId}`} className="hr-strike">
                {current.fullName} ({current.teacherCode})
              </Link>
              <Icon name="lock" size="sm" />
            </div>
            <div className="hr-redpen">
              <Icon name="edit_note" size="sm" /> Cần thay GVCN vì tài khoản đã bị khoá
              <button type="button" className="hr-inline-btn" onClick={() => setReplacing(true)}>
                Chọn thay thế
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="hr-select-wrap">
              <select
                className={`hr-select${status === 'unassigned' ? ' hr-select--empty' : ''}`}
                value={current && (rules.lockedTeacherAllowed || current.status !== 'LOCKED') ? value : ''}
                onChange={(e) => onChange(cls.classId, idOf(e.target.value))}
                aria-label={`Giáo viên chủ nhiệm lớp ${cls.className}`}
              >
                <option value="">— Chưa phân công —</option>
                {groups.free.length > 0 && (
                  <optgroup label="Chưa chủ nhiệm lớp nào">
                    {groups.free.map((t) => (
                      <option key={t.teacherId} value={String(t.teacherId)}>{teacherLabel(t)}</option>
                    ))}
                  </optgroup>
                )}
                {groups.busy.length > 0 && (
                  <optgroup label="Đang chủ nhiệm lớp khác">
                    {groups.busy.map((t) => (
                      <option
                        key={t.teacherId}
                        value={String(t.teacherId)}
                        disabled={t.others.length >= rules.maxClassesPerTeacher}
                      >
                        {teacherLabel(t)} · CN {t.others.map((c) => c.className).join(', ')}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <Icon name="expand_more" className="hr-select-icon" />
            </div>
            {changed && (
              <div className="hr-change-note">
                <span>Trước: {previous ? previous.fullName : 'chưa có GVCN'}</span>
                <button type="button" className="hr-inline-btn" onClick={() => { onChange(cls.classId, original); setReplacing(false); }}>
                  Hoàn tác
                </button>
              </div>
            )}
            {!changed && status === 'unassigned' && (
              <div className="hr-amber-note"><Icon name="info" size="sm" /> Lớp chưa có giáo viên chủ nhiệm</div>
            )}
          </>
        )}
      </td>
      <td>
        {changed ? (
          <span className="hr-badge hr-badge--ink">Chưa lưu</span>
        ) : status === 'ok' ? (
          <span className="hr-status"><span className="hr-dot hr-dot--green" />{STATUS_LABELS.ok}</span>
        ) : (
          <span className={`hr-badge hr-badge--${status === 'locked' ? 'red' : 'amber'}`}>
            {status === 'locked' && <Icon name="warning" size="sm" />}
            {STATUS_LABELS[status]}
          </span>
        )}
      </td>
      <td className="hr-center">
        {current && (
          <Link to={`/teachers/${current.teacherId}`} className="btn btn-icon hr-view" aria-label={`Xem hồ sơ ${current.fullName}`}>
            <Icon name="open_in_new" size="sm" />
          </Link>
        )}
      </td>
    </tr>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
// SCR-16 Homeroom Assignment (UC-19): School Manager sets one homeroom teacher per class per school year.
export default function HomeroomAssignmentPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [board, setBoard] = useState(null);
  const [yearId, setYearId] = useState(null);
  const [draft, setDraft] = useState({}); // classId -> teacherId|null (only changed classes)
  const [grade, setGrade] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const statusFilter = searchParams.get('status') ?? 'all';

  const load = useCallback(async (id) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getHomeroomBoard(id);
      setBoard(data);
      setYearId(data.schoolYear ? String(data.schoolYear.id) : null);
      setDraft({});
      setSaveError(null);
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const teacherById = useMemo(
    () => Object.fromEntries((board?.teachers ?? []).map((t) => [String(t.teacherId), { ...t, teacherId: String(t.teacherId) }])),
    [board],
  );
  const classes = useMemo(
    () => (board?.classes ?? []).map((c) => ({ ...c, classId: String(c.classId), homeroomTeacherId: idOf(c.homeroomTeacherId) })),
    [board],
  );
  const valueOf = useCallback((c) => (c.classId in draft ? draft[c.classId] : c.homeroomTeacherId), [draft]);
  const statusOf = useCallback(
    (tid) => (!tid || !teacherById[tid] ? 'unassigned' : teacherById[tid].status === 'LOCKED' ? 'locked' : 'ok'),
    [teacherById],
  );

  // Who holds which class after the pending changes (used to disable teachers at the limit).
  const holders = useMemo(() => {
    const map = {};
    for (const c of classes) {
      const tid = valueOf(c);
      if (tid) (map[tid] ??= []).push({ classId: c.classId, className: c.className });
    }
    return map;
  }, [classes, valueOf]);

  const changes = useMemo(
    () => classes.filter((c) => c.classId in draft && draft[c.classId] !== c.homeroomTeacherId),
    [classes, draft],
  );
  const dirty = changes.length > 0;

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function setTeacher(classId, teacherId) {
    setSaveError(null);
    setDraft((d) => {
      const next = { ...d };
      const cls = classes.find((c) => c.classId === classId);
      if (cls && cls.homeroomTeacherId === teacherId) delete next[classId];
      else next[classId] = teacherId;
      return next;
    });
  }

  function changeYear(id) {
    if (dirty && !window.confirm('Bỏ các thay đổi chưa lưu để chuyển năm học?')) return;
    load(id);
  }

  function setStatusFilter(value) {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setSearchParams(next, { replace: true });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const data = await saveHomeroomAssignments(
        Number(yearId),
        changes.map((c) => ({
          classId: Number(c.classId),
          teacherId: draft[c.classId] ? Number(draft[c.classId]) : null,
          previousTeacherId: c.homeroomTeacherId ? Number(c.homeroomTeacherId) : null,
        })),
      );
      setBoard(data);
      setDraft({});
      toast(`Đã lưu phân công chủ nhiệm cho ${changes.length} lớp.`);
    } catch (err) {
      setSaveError({ text: errorText(err), stale: err.code === 'MSG_HOMEROOM_STALE' });
    } finally {
      setSaving(false);
    }
  }

  // Counts: grade tabs and the status filter use the saved state, so rows do not jump while editing.
  const grades = useMemo(() => {
    const map = new Map();
    for (const c of classes) map.set(c.gradeLevel, (map.get(c.gradeLevel) ?? 0) + 1);
    return [...map.entries()];
  }, [classes]);
  const inGrade = classes.filter((c) => grade === 'all' || c.gradeLevel === grade);
  const savedCounts = { unassigned: 0, locked: 0, ok: 0 };
  for (const c of inGrade) savedCounts[statusOf(c.homeroomTeacherId)] += 1;
  const visible = inGrade.filter((c) => statusFilter === 'all' || statusOf(c.homeroomTeacherId) === statusFilter);

  // Summary bar uses the state after pending changes.
  const after = { unassigned: 0, locked: 0, ok: 0 };
  for (const c of classes) after[statusOf(valueOf(c))] += 1;
  const todo = after.unassigned + after.locked;

  const schoolYear = board?.schoolYear;
  const yearLabel = schoolYear?.name?.replace('-', '–') ?? '';

  return (
    <div className="hr-page">
      <div className="hr-head">
        <div>
          <nav className="hr-breadcrumb" aria-label="Breadcrumb">
            <span>EduConnect</span><span>/</span><span>Hồ sơ</span><span>/</span><span>Phân công</span><span>/</span>
            <strong>Giáo viên chủ nhiệm</strong>
            <span className="stamp-badge">SCR-16</span>
          </nav>
          <h1 className="headline-lg hr-title">Phân công giáo viên chủ nhiệm{yearLabel ? ` – ${yearLabel}` : ''}</h1>
          <p className="hr-subtitle">Chọn giáo viên chủ nhiệm cho từng lớp trong năm học.</p>
        </div>
        <div className="hr-head-side">
          {board?.schoolYears?.length > 0 && (
            <div className="select-wrap hr-year">
              <select value={yearId ?? ''} onChange={(e) => changeYear(e.target.value)} aria-label="Năm học">
                {board.schoolYears.map((y) => (
                  <option key={y.id} value={String(y.id)}>
                    Năm học {y.name}{y.isCurrent ? ' (hiện tại)' : ''}
                  </option>
                ))}
              </select>
              <Icon name="expand_more" className="select-icon" />
            </div>
          )}
          {yearLabel && <span className="stamp"><Icon name="verified" size="sm" /> Năm học · {yearLabel}</span>}
        </div>
      </div>

      {board?.rules && (
        <div className="hr-rule">
          <Icon name="policy" />
          <div>
            <div className="hr-rule-title">Quy định phân công</div>
            <p>
              Mỗi lớp có <strong>một</strong> giáo viên chủ nhiệm trong một năm học; mỗi giáo viên chủ nhiệm tối đa{' '}
              <strong>{board.rules.maxClassesPerTeacher} lớp</strong>.
              {!board.rules.lockedTeacherAllowed && ' Giáo viên đã bị khoá tài khoản không thể nhận chủ nhiệm.'}
              {' '}Lớp chưa có chủ nhiệm sẽ không có người duyệt bài đăng của lớp.
            </p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="hr-error">
          <Icon name="error_outline" /> {loadError}
          <button type="button" className="btn btn-secondary" onClick={() => load(yearId)}>Thử lại</button>
        </div>
      )}

      {board && !schoolYear && (
        <div className="hr-empty-card"><Icon name="event_busy" /> Chưa có năm học nào được tạo.</div>
      )}

      {board && schoolYear && (
        <>
          <div className="hr-toolbar">
            <div className="hr-tabs" role="tablist" aria-label="Khối">
              <button type="button" role="tab" aria-selected={grade === 'all'} className={`hr-tab${grade === 'all' ? ' is-active' : ''}`} onClick={() => setGrade('all')}>
                Tất cả ({classes.length} lớp)
              </button>
              {grades.map(([g, n]) => (
                <button key={g} type="button" role="tab" aria-selected={grade === g} className={`hr-tab${grade === g ? ' is-active' : ''}`} onClick={() => setGrade(g)}>
                  Khối {g} ({n} lớp)
                </button>
              ))}
            </div>
            <div className="hr-filters">
              <label className="hr-filter-label" htmlFor="hr-status">Trạng thái:</label>
              <div className="select-wrap">
                <select id="hr-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">Tất cả trạng thái</option>
                  <option value="unassigned">Chưa có GVCN ({savedCounts.unassigned})</option>
                  <option value="locked">GVCN đã khoá ({savedCounts.locked})</option>
                  <option value="ok">Đã có GVCN ({savedCounts.ok})</option>
                </select>
                <Icon name="expand_more" className="select-icon" />
              </div>
              <span className="hr-pill"><span className="hr-dot hr-dot--green" />Đã phân công: <strong>{savedCounts.ok}/{inGrade.length}</strong></span>
              {savedCounts.unassigned > 0 && <span className="hr-pill hr-pill--amber">Chưa có GVCN: <strong>{savedCounts.unassigned}</strong></span>}
              {savedCounts.locked > 0 && <span className="hr-pill hr-pill--red">GVCN đã khoá: <strong>{savedCounts.locked}</strong></span>}
            </div>
          </div>

          <div className={`hr-table-card${loading ? ' is-loading' : ''}`}>
            <div className="hr-table-scroll">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th style={{ width: 88 }}>Lớp</th>
                    <th style={{ width: 170 }}>Khối / Ban</th>
                    <th className="hr-right" style={{ width: 120 }}>Sĩ số</th>
                    <th style={{ minWidth: 360 }}>Giáo viên chủ nhiệm</th>
                    <th style={{ width: 160 }}>Tình trạng</th>
                    <th className="hr-center" style={{ width: 56 }}>Hồ sơ</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="hr-empty">
                        <Icon name="filter_alt_off" />
                        {classes.length === 0 ? 'Năm học này chưa có lớp nào.' : 'Không có lớp nào khớp bộ lọc.'}
                      </td>
                    </tr>
                  ) : (
                    visible.map((c) => (
                      <ClassRow
                        key={c.classId}
                        cls={c}
                        original={c.homeroomTeacherId}
                        value={valueOf(c)}
                        teacherById={teacherById}
                        holders={holders}
                        rules={board.rules}
                        onChange={setTeacher}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="hr-table-foot">
              Hiển thị {visible.length} trên tổng số {classes.length} lớp của năm học {schoolYear.name}
            </div>
          </div>

          {saveError && (
            <div className="form-error hr-save-error" role="alert">
              <Icon name="error" size="sm" />
              <span>{saveError.text}</span>
              {saveError.stale && (
                <button type="button" className="hr-inline-btn" onClick={() => load(yearId)}>Tải lại dữ liệu</button>
              )}
            </div>
          )}

          <div className="hr-savebar">
            <div className="hr-savebar-info">
              <Icon name="fact_check" />
              <span>
                Đã có GVCN <strong>{after.ok}/{classes.length}</strong> lớp
                {todo > 0 && <span className="hr-todo"> · Còn {todo} lớp cần xử lý</span>}
                {dirty && <span className="hr-pending"> · {changes.length} thay đổi chưa lưu</span>}
              </span>
            </div>
            <div className="hr-savebar-actions">
              <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => { setDraft({}); setSaveError(null); }}>
                Huỷ thay đổi
              </button>
              <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={handleSave}>
                <Icon name="check" size="sm" /> {saving ? 'Đang lưu…' : 'Lưu phân công'}
              </button>
            </div>
          </div>
        </>
      )}

      {loading && !board && (
        <div className="hr-table-card hr-skeleton" style={{ height: 360 }} aria-busy="true" aria-label="Đang tải" />
      )}
    </div>
  );
}
