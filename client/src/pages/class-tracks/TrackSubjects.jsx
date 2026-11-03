import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { trackLabel } from './trackLabel.js';

// Same limit as the server (UC-26): periods per week 1–10. Every subject weight is 1 and is not shown (agreed 01/11).
const periodsValid = (text) => /^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 10;

function initialRows(subjects) {
  return Object.fromEntries(
    subjects.map((s) => [s.subjectId, { on: s.configured, periods: s.configured ? String(s.periodsPerWeek) : '1' }]),
  );
}

const sameRow = (a, b) => a.on === b.on && (!a.on || a.periods.trim() === b.periods.trim());

// SCR-70 right column: the subjects one class type studies in the selected year, with periods per week (UC-26).
// The subjects of another type (e.g. the same type of the grade below) can be copied in, then adjusted before
// saving. Saving sends the whole list; the server removes unticked subjects.
export default function TrackSubjects({ data, tracks, onSaved, onEdit, onDeleted, onDirtyChange }) {
  const toast = useToast();
  const { track, schoolYear, subjects } = data;
  const [initial, setInitial] = useState(() => initialRows(subjects));
  const [rows, setRows] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);

  const canEditPeriods = Boolean(schoolYear) && !schoolYear.ended;
  const canEditSubjects = canEditPeriods && !schoolYear.weightsLocked; // the year has no grades yet
  const others = tracks.filter((t) => t.trackId !== track.trackId && t.subjectCount > 0);

  const dirty = useMemo(
    () => subjects.some((s) => !sameRow(rows[s.subjectId], initial[s.subjectId])),
    [subjects, rows, initial],
  );
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const chosen = subjects.filter((s) => rows[s.subjectId].on);
  const invalid = chosen.some((s) => !periodsValid(rows[s.subjectId].periods));
  const totalPeriods = chosen.reduce(
    (sum, s) => sum + (periodsValid(rows[s.subjectId].periods) ? Number(rows[s.subjectId].periods) : 0),
    0,
  );

  const setRow = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  // Fills the table from another class type of the same year; nothing is saved until "Lưu thay đổi".
  async function copyFrom(trackId) {
    const source = others.find((t) => t.trackId === Number(trackId));
    if (!source) return;
    setCopying(true);
    setError('');
    try {
      const { data: src } = await api.get(`/class-tracks/${source.trackId}/subjects`, {
        params: { schoolYearId: schoolYear.schoolYearId },
      });
      setRows(initialRows(src.subjects));
      toast(`Đã lấy môn học của ${trackLabel(source)}. Kiểm tra lại rồi bấm “Lưu thay đổi”.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCopying(false);
    }
  }

  async function handleSave() {
    if (invalid) {
      setError('Vui lòng kiểm tra lại số tiết được đánh dấu đỏ.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data: saved } = await api.put(`/class-tracks/${track.trackId}/subjects`, {
        schoolYearId: schoolYear.schoolYearId,
        items: chosen.map((s) => ({ subjectId: s.subjectId, periodsPerWeek: Number(rows[s.subjectId].periods) })),
      });
      const next = initialRows(saved.subjects);
      setInitial(next);
      setRows(next);
      toast(`Đã lưu môn học của ${trackLabel(track)} cho năm học ${yearLabel(schoolYear.yearName)}.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/class-tracks/${track.trackId}`);
      onDeleted(track);
    } catch (err) {
      setError(errorText(err));
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  return (
    <section className="card card-outline track-panel">
      <div className="track-panel-head">
        <div className="year-detail-icon">
          <Icon name="category" />
        </div>
        <div className="track-panel-title">
          <h2 className="title-md">
            {track.trackName}
            <span className="chip ink track-grade-chip">{track.gradeLevel ? `Khối ${track.gradeLevel}` : 'Mọi khối'}</span>
          </h2>
          {track.description && <p className="muted">{track.description}</p>}
        </div>
        <button type="button" className="btn btn-secondary" onClick={onEdit}>
          <Icon name="edit" size="sm" />
          Sửa
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setConfirmDelete(true)}
          disabled={track.inUse || confirmDelete}
          title={track.inUse ? 'Đang có lớp thuộc loại này nên không xoá được.' : undefined}
        >
          <Icon name="delete" size="sm" />
          Xoá
        </button>
      </div>

      {confirmDelete && (
        <div className="confirm-box amber track-confirm">
          <div className="confirm-head">
            <Icon name="warning" />
            <p>
              Xoá loại lớp <strong>{trackLabel(track)}</strong>? Loại lớp này sẽ không còn được chọn khi tạo hoặc nhập
              lớp mới.
            </p>
          </div>
          <div className="card-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Huỷ
            </button>
            <button type="button" className="btn btn-primary" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Đang xoá…' : 'Xoá loại lớp'}
            </button>
          </div>
        </div>
      )}

      {!schoolYear ? (
        <p className="muted">Chưa có năm học để thiết lập môn.</p>
      ) : (
        <>
          <div className="track-table-bar">
            <p className="label-upper muted track-table-label">Môn học năm {yearLabel(schoolYear.yearName)}</p>
            {canEditSubjects && others.length > 0 && (
              <select
                className="input track-copy-select"
                value=""
                onChange={(e) => copyFrom(e.target.value)}
                disabled={copying || saving}
                aria-label="Sao chép môn từ loại lớp khác"
              >
                <option value="">{copying ? 'Đang lấy môn…' : 'Sao chép môn từ…'}</option>
                {others.map((t) => (
                  <option key={t.trackId} value={t.trackId}>
                    {trackLabel(t)} ({t.subjectCount} môn)
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="table-scroll">
            <table className="table track-table">
              <thead>
                <tr>
                  <th className="check">Áp dụng</th>
                  <th>Mã môn</th>
                  <th>Tên môn học</th>
                  <th className="num">Số tiết/tuần</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => {
                  const row = rows[s.subjectId];
                  const badPeriods = row.on && !periodsValid(row.periods);
                  return (
                    <tr key={s.subjectId} className={row.on ? '' : 'is-off'}>
                      <td className="check">
                        <input
                          type="checkbox"
                          checked={row.on}
                          disabled={!canEditSubjects}
                          onChange={(e) => setRow(s.subjectId, { on: e.target.checked })}
                          aria-label={`Áp dụng môn ${s.subjectName}`}
                        />
                      </td>
                      <td className="mono subject-code">{s.subjectCode}</td>
                      <td className="subject-name">{s.subjectName}</td>
                      <td className="num">
                        {row.on ? (
                          <input
                            className={`input track-input${badPeriods ? ' bad' : ''}`}
                            inputMode="numeric"
                            value={row.periods}
                            disabled={!canEditPeriods}
                            onChange={(e) => setRow(s.subjectId, { periods: e.target.value })}
                            aria-label={`Số tiết mỗi tuần môn ${s.subjectName}`}
                            aria-invalid={badPeriods || undefined}
                          />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {subjects.length === 0 && <p className="subject-empty muted">Trường chưa có môn học nào.</p>}
          <p className="field-help track-help">
            Số tiết mỗi tuần từ 1 đến 10. Mọi môn có hệ số như nhau khi tính điểm trung bình.
          </p>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {canEditPeriods && (
            <div className="card-footer track-footer">
              <span className="left">
                {chosen.length} môn · {totalPeriods} tiết mỗi tuần
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRows(initial);
                  setError('');
                }}
                disabled={!dirty || saving}
              >
                Huỷ thay đổi
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || saving}>
                {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
