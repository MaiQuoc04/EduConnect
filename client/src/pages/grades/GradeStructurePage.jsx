import { useCallback, useEffect, useMemo, useState } from 'react';
import { copyStructure, getStructure, listStructures, saveStructure } from '../../api/grades.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import Dialog from '../admin/Dialog.jsx';
import '../admin/admin.css';
import SemesterSelect from './SemesterSelect.jsx';
import useGradeOptions from './useGradeOptions.js';
import './grades.css';

// SCR-25 Grade Configuration – UC-81 Configure Grade Structure and UC-82 Copy Grade Structure (School Manager).
// A structure = the components of one subject × grade level × semester. Weight = coefficient of each score
// (Circular 22: TX ×1, GK ×2, CK ×3); it locks once the structure has grades.

const DEFAULT_COMPONENTS = [
  { name: 'Thường xuyên', weight: '1', scoreCount: '4' },
  { name: 'Giữa kỳ', weight: '2', scoreCount: '1' },
  { name: 'Cuối kỳ', weight: '3', scoreCount: '1' },
];
const ROW_TEXT = {
  REQUIRED: 'Nhập tên thành phần.',
  TOO_LONG: 'Tên tối đa 100 ký tự.',
  DUPLICATE: 'Tên thành phần bị trùng.',
  INVALID: 'Giá trị không hợp lệ.',
};

const toForm = (components) =>
  components.map((c) => ({ name: c.name, weight: String(c.weight).replace('.', ','), scoreCount: String(c.scoreCount) }));

export default function GradeStructurePage() {
  const toast = useToast();
  const options = useGradeOptions();
  const [semesterId, setSemesterId] = useState('');
  const [gradeLevelId, setGradeLevelId] = useState('');
  const [list, setList] = useState({ loading: false, data: null, error: '' });
  const [subjectId, setSubjectId] = useState('');
  const [detail, setDetail] = useState(null); // { components, locked, subject }
  const [rows, setRows] = useState([]);
  const [rowErrors, setRowErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  useEffect(() => {
    if (!options.data) return;
    setSemesterId((v) => v || String(options.data.currentSemesterId ?? options.semesters[0]?.semesterId ?? ''));
    setGradeLevelId((v) => v || String(options.data.gradeLevels[0]?.gradeLevelId ?? ''));
  }, [options.data, options.semesters]);

  const loadList = useCallback(() => {
    if (!semesterId || !gradeLevelId) return;
    setList((s) => ({ ...s, loading: true, error: '' }));
    listStructures(semesterId, gradeLevelId)
      .then((data) => setList({ loading: false, data, error: '' }))
      .catch((err) => setList({ loading: false, data: null, error: errorText(err) }));
  }, [semesterId, gradeLevelId]);
  useEffect(loadList, [loadList]);

  useEffect(() => {
    if (!list.data) return;
    const ids = list.data.subjects.map((s) => String(s.subjectId));
    if (!ids.includes(subjectId)) setSubjectId(String((list.data.subjects.find((s) => s.taught) ?? list.data.subjects[0])?.subjectId ?? ''));
  }, [list.data, subjectId]);

  useEffect(() => {
    if (!semesterId || !gradeLevelId || !subjectId) return;
    let alive = true;
    setDetail(null);
    getStructure(semesterId, gradeLevelId, subjectId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setRows(d.components.length ? toForm(d.components) : DEFAULT_COMPONENTS);
        setRowErrors([]);
      })
      .catch((err) => alive && toast(errorText(err), { type: 'error' }));
    return () => {
      alive = false;
    };
  }, [semesterId, gradeLevelId, subjectId, toast]);

  const semester = options.semesters.find((s) => String(s.semesterId) === semesterId);
  const grade = options.data?.gradeLevels.find((g) => String(g.gradeLevelId) === gradeLevelId);
  const subject = list.data?.subjects.find((s) => String(s.subjectId) === subjectId);
  const locked = Boolean(detail?.locked);
  const ended = Boolean(detail?.semester?.yearEnded);
  const readOnly = locked || ended;
  const dirty = useMemo(
    () => detail && JSON.stringify(rows) !== JSON.stringify(detail.components.length ? toForm(detail.components) : []),
    [rows, detail],
  );

  const setRow = (i, key) => (e) => {
    const value = e.target.value;
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
    setRowErrors((es) => es.filter((x) => !(x.index === i && x.field === key)));
  };
  const errorOf = (i, field) => rowErrors.find((x) => x.index === i && x.field === field);

  async function save() {
    setSaving(true);
    try {
      const d = await saveStructure(
        semesterId,
        gradeLevelId,
        subjectId,
        rows.map((r) => ({ name: r.name, weight: r.weight.replace(',', '.'), scoreCount: Number(r.scoreCount) })),
      );
      setDetail(d);
      setRows(toForm(d.components));
      setRowErrors([]);
      toast('Đã lưu cấu trúc điểm.');
      loadList();
    } catch (err) {
      if (err.code === 'MSG_STRUCTURE_INVALID') setRowErrors(err.details?.rows ?? []);
      toast(errorText(err), { type: 'error' });
      if (err.code === 'MSG_STRUCTURE_LOCKED') loadList();
    } finally {
      setSaving(false);
    }
  }

  const firstRowError = rowErrors.find((e) => e.index === -1);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Học tập</span>/<span className="current">Cấu trúc điểm</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Cấu trúc điểm</h1>
          <p>Thành phần điểm, hệ số và số lần kiểm tra của từng môn theo khối và học kỳ. Cấu trúc bị khoá khi đã có điểm.</p>
        </div>
      </div>

      {options.error && <p className="form-error">{options.error}</p>}

      <div className="grade-toolbar">
        <SemesterSelect semesters={options.semesters} value={semesterId} onChange={setSemesterId} />
        <label className="field" htmlFor="grade-level">
          <span className="field-label">Khối</span>
          <select id="grade-level" className="input" value={gradeLevelId} onChange={(e) => setGradeLevelId(e.target.value)}>
            {options.data?.gradeLevels.map((g) => (
              <option key={g.gradeLevelId} value={g.gradeLevelId}>
                Khối {g.gradeLevelName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.error && <p className="form-error">{list.error}</p>}

      <div className="structure-layout">
        <section className="card card-outline structure-subjects" aria-label="Môn học">
          {list.data?.subjects.map((s) => (
            <button
              key={s.subjectId}
              type="button"
              className={`structure-subject${String(s.subjectId) === subjectId ? ' active' : ''}${s.taught ? '' : ' untaught'}`}
              onClick={() => setSubjectId(String(s.subjectId))}
            >
              <span>
                {s.subjectName}
                <span className="meta">
                  {' '}
                  {s.componentCount ? `· ${s.componentCount} thành phần` : '· chưa cấu hình'}
                  {!s.taught && ' · không học ở khối này'}
                </span>
              </span>
              {s.locked && <Icon name="lock" size="sm" />}
            </button>
          ))}
          {list.data && !list.data.subjects.length && <p className="muted">Chưa có môn học nào.</p>}
        </section>

        <section className="card card-outline">
          {!detail ? (
            <p className="muted">{subjectId ? 'Đang tải…' : 'Chọn một môn học.'}</p>
          ) : (
            <>
              <div className="card-title">
                <Icon name="tune" />
                <h2 className="title-md">
                  {subject?.subjectName} · Khối {grade?.gradeLevelName} · {semester && `Học kỳ ${semester.semesterNo}, ${semester.yearName}`}
                </h2>
                <span className="aside">
                  {locked ? (
                    <span className="gtag amber">
                      <Icon name="lock" size="sm" /> Đã có điểm – không sửa được
                    </span>
                  ) : detail.components.length ? (
                    <span className="gtag green">Đã cấu hình</span>
                  ) : (
                    <span className="gtag">Chưa cấu hình</span>
                  )}
                </span>
              </div>

              {ended && !locked && <p className="notice" style={{ marginBottom: 16 }}>Năm học đã kết thúc, cấu trúc chỉ để xem.</p>}

              <div className="table-scroll" style={{ border: 0 }}>
                <table className="table component-table">
                  <thead>
                    <tr>
                      <th>Thành phần</th>
                      <th className="num">Hệ số</th>
                      <th className="num">Số lần điểm</th>
                      {!readOnly && <th aria-label="Xoá" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          {readOnly ? (
                            r.name
                          ) : (
                            <>
                              <input
                                className="input"
                                value={r.name}
                                onChange={setRow(i, 'name')}
                                maxLength={100}
                                placeholder="Ví dụ: TX"
                                aria-label={`Tên thành phần ${i + 1}`}
                              />
                              {errorOf(i, 'name') && <span className="field-error">{ROW_TEXT[errorOf(i, 'name').code]}</span>}
                            </>
                          )}
                        </td>
                        <td className="num">
                          {readOnly ? (
                            r.weight
                          ) : (
                            <>
                              <input
                                className="input"
                                value={r.weight}
                                onChange={setRow(i, 'weight')}
                                inputMode="decimal"
                                aria-label={`Hệ số thành phần ${i + 1}`}
                              />
                              {errorOf(i, 'weight') && <span className="field-error">Lớn hơn 0, tối đa 100.</span>}
                            </>
                          )}
                        </td>
                        <td className="num">
                          {readOnly ? (
                            r.scoreCount
                          ) : (
                            <>
                              <input
                                className="input"
                                type="number"
                                min={1}
                                max={10}
                                value={r.scoreCount}
                                onChange={setRow(i, 'scoreCount')}
                                aria-label={`Số lần điểm thành phần ${i + 1}`}
                              />
                              {errorOf(i, 'scoreCount') && <span className="field-error">Từ 1 đến 10.</span>}
                            </>
                          )}
                        </td>
                        {!readOnly && (
                          <td>
                            <button
                              type="button"
                              className="btn btn-icon"
                              aria-label="Xoá thành phần"
                              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                              disabled={rows.length <= 1}
                            >
                              <Icon name="delete" size="sm" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {firstRowError && (
                <p className="field-error">{firstRowError.code === 'TOO_MANY' ? 'Tối đa 10 thành phần.' : 'Cần ít nhất một thành phần.'}</p>
              )}

              <div className="card-footer">
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-tertiary left"
                    onClick={() => setRows((rs) => [...rs, { name: '', weight: '1', scoreCount: '1' }])}
                    disabled={rows.length >= 10}
                  >
                    <Icon name="add" size="sm" /> Thêm thành phần
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCopyOpen(true)}
                  disabled={!detail.components.length}
                  title={detail.components.length ? '' : 'Lưu cấu trúc trước khi sao chép'}
                >
                  <Icon name="content_copy" size="sm" /> Sao chép sang…
                </button>
                {!readOnly && (
                  <button type="button" className="btn btn-primary" onClick={save} disabled={saving || (!dirty && detail.components.length > 0)}>
                    {saving ? 'Đang lưu…' : 'Lưu cấu trúc'}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {copyOpen && detail && (
        <CopyDialog
          options={options}
          source={{ semesterId, gradeLevelId, subjectId }}
          sourceName={detail.subject?.subjectName ?? ''}
          onClose={() => setCopyOpen(false)}
          onDone={(result) => {
            setCopyOpen(false);
            toast(result.copied > 1 ? `Đã sao chép cấu trúc điểm sang ${result.copied} môn.` : 'Đã sao chép cấu trúc điểm.');
            // Stay on the shown subject when the copy went to the same semester and grade; else open the first target.
            const sameView = String(result.semesterId) === semesterId && String(result.gradeLevelId) === gradeLevelId;
            if (!sameView) {
              setSemesterId(String(result.semesterId));
              setGradeLevelId(String(result.gradeLevelId));
              setSubjectId(String(result.subjectIds[0]));
            }
            loadList();
          }}
        />
      )}
    </>
  );
}

// UC-82: copy the shown structure to one or several subjects of a semester × grade level (default: semester 2 of the
// same subject). Subjects that already have grades cannot be chosen; configured ones are replaced (shown as a warning).
function CopyDialog({ options, source, sourceName, onClose, onDone }) {
  const sourceSemester = options.semesters.find((s) => String(s.semesterId) === source.semesterId);
  const sameYear = options.semesters.filter((s) => s.schoolYearId === sourceSemester?.schoolYearId);
  const otherSemester = sameYear.find((s) => String(s.semesterId) !== source.semesterId);
  const [semester, setSemester] = useState(String(otherSemester?.semesterId ?? source.semesterId));
  const [grade, setGrade] = useState(source.gradeLevelId);
  const [subjects, setSubjects] = useState({ loading: true, items: [], error: '' });
  const [picked, setPicked] = useState(() => new Set(otherSemester ? [source.subjectId] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sameView = semester === source.semesterId && grade === source.gradeLevelId;

  // The subjects of the chosen semester × grade, with their state there (configured / has grades).
  useEffect(() => {
    let alive = true;
    setSubjects((s) => ({ ...s, loading: true, error: '' }));
    listStructures(semester, grade)
      .then((d) => alive && setSubjects({ loading: false, items: d.subjects, error: '' }))
      .catch((err) => alive && setSubjects({ loading: false, items: [], error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [semester, grade]);

  const blockReason = (s) => {
    if (sameView && String(s.subjectId) === source.subjectId) return 'bản gốc';
    if (s.locked) return 'đã có điểm';
    return '';
  };
  const selectable = subjects.items.filter((s) => !blockReason(s));
  // Only subjects that can be chosen here count (a choice kept from another semester or grade is ignored).
  const chosen = selectable.filter((s) => picked.has(String(s.subjectId)));
  const replaced = chosen.filter((s) => s.componentCount > 0);

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickAll = (list) => setPicked(new Set(list.map((s) => String(s.subjectId))));

  async function run() {
    setBusy(true);
    setError('');
    try {
      const result = await copyStructure(source, {
        semesterId: semester,
        gradeLevelId: grade,
        subjectIds: chosen.map((s) => s.subjectId),
      });
      onDone(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Sao chép cấu trúc điểm"
      icon="content_copy"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={run} disabled={busy || !chosen.length}>
            {busy ? 'Đang sao chép…' : chosen.length ? `Sao chép sang ${chosen.length} môn` : 'Sao chép'}
          </button>
        </>
      }
    >
      <p>
        Sao chép cấu trúc của <strong>{sourceName}</strong> sang các môn được chọn. Mỗi bản sao độc lập với bản gốc.
      </p>
      <div className="copy-targets">
        <SemesterSelect id="copy-semester" semesters={options.semesters} value={semester} onChange={setSemester} label="Sang học kỳ" />
        <label className="field" htmlFor="copy-grade">
          <span className="field-label">Khối</span>
          <select id="copy-grade" className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {options.data.gradeLevels.map((g) => (
              <option key={g.gradeLevelId} value={g.gradeLevelId}>
                Khối {g.gradeLevelName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="copy-pick-head">
        <span className="field-label">Môn ({chosen.length} đã chọn)</span>
        <div className="copy-pick-actions">
          <button type="button" className="btn btn-tertiary" onClick={() => pickAll(selectable.filter((s) => !s.componentCount))}>
            Môn chưa cấu hình
          </button>
          <button type="button" className="btn btn-tertiary" onClick={() => pickAll(selectable)}>
            Tất cả
          </button>
          <button type="button" className="btn btn-tertiary" onClick={() => setPicked(new Set())}>
            Bỏ chọn
          </button>
        </div>
      </div>
      <ul className={`copy-pick-list${subjects.loading ? ' is-loading' : ''}`}>
        {subjects.items.map((s) => {
          const id = String(s.subjectId);
          const reason = blockReason(s);
          return (
            <li key={id}>
              <label className={reason ? 'disabled' : undefined}>
                <input type="checkbox" checked={!reason && picked.has(id)} disabled={!!reason || busy} onChange={() => toggle(id)} />
                <span className="grow">{s.subjectName}</span>
                <span className="caption muted">
                  {reason ||
                    (s.componentCount
                      ? `${s.componentCount} thành phần${picked.has(id) ? ' · sẽ bị thay thế' : ''}`
                      : 'chưa cấu hình')}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {subjects.error && <p className="form-error">{subjects.error}</p>}
      {replaced.length > 0 && (
        <p className="caption copy-warn">
          <Icon name="warning" size="sm" /> {replaced.length} môn đã có cấu trúc sẽ bị thay thế bằng cấu trúc của {sourceName}.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          <Icon name="error" size="sm" />
          {error}
        </p>
      )}
    </Dialog>
  );
}
