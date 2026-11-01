import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { errorText } from '../../messages.js';

const NAME_CODES = ['MSG_TRACK_NAME_TAKEN', 'MSG_TRACK_NAME_LENGTH', 'MSG_TRACK_NAME_PREFIX'];

// SCR-71 create / edit a class type (UC-26). `track` = the type being edited, or null to create one.
// A class type belongs to one grade or to every grade; creating it for several grades makes one type per grade
// ("Khối A" for 10 and 11 -> "10 · Khối A", "11 · Khối A"), each with its own subjects. The server composes the name.
export default function TrackForm({ track, onSaved, onCancel }) {
  const editing = Boolean(track);
  const [grades, setGrades] = useState([]);
  const [form, setForm] = useState({ trackName: track?.name ?? '', description: track?.description ?? '' });
  const [picked, setPicked] = useState([]); // create: gradeLevelIds ([] = every grade)
  const [gradeLevelId, setGradeLevelId] = useState(''); // edit: '' = every grade
  const [error, setError] = useState(null); // { field: 'name' | null, text }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/classes/grade-levels')
      .then(({ data }) => {
        setGrades(data);
        const own = data.find((g) => g.gradeLevelName === track?.gradeLevel);
        if (own) setGradeLevelId(String(own.gradeLevelId));
      })
      .catch(() => setGrades([]));
  }, [track?.gradeLevel]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleGrade = (id) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.trackName.trim()) {
      setError({ field: 'name', text: errorText({ code: 'MSG_REQUIRED' }) });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const { data } = await api.put(`/class-tracks/${track.trackId}`, {
          ...form,
          gradeLevelId: gradeLevelId ? Number(gradeLevelId) : null,
        });
        onSaved([data], true);
      } else {
        const { data } = await api.post('/class-tracks', { ...form, gradeLevelIds: picked });
        onSaved(data.tracks, false);
      }
    } catch (err) {
      setError({ field: NAME_CODES.includes(err.code) ? 'name' : null, text: errorText(err) });
      setSaving(false);
    }
  }

  const sortedPicked = grades.filter((g) => picked.includes(g.gradeLevelId));
  const preview = form.trackName.trim()
    ? sortedPicked.length
      ? sortedPicked.map((g) => `${g.gradeLevelName} · ${form.trackName.trim()}`).join(', ')
      : `${form.trackName.trim()} (mọi khối)`
    : '';

  return (
    <form className="card card-outline form-card year-form" onSubmit={handleSubmit} noValidate>
      <div>
        <p className="label-upper muted">{editing ? 'Chỉnh sửa loại lớp' : 'Thêm loại lớp'}</p>
        <h2 className="title-md">{editing ? track.trackName : 'Loại lớp mới'}</h2>
      </div>

      <div className={`field${error?.field === 'name' ? ' invalid' : ''}`}>
        <label className="field-label" htmlFor="track-name">
          Tên loại lớp
        </label>
        <div className="input-wrap">
          <input
            id="track-name"
            className="input"
            value={form.trackName}
            onChange={set('trackName')}
            placeholder="Khối A"
            maxLength={95}
            autoFocus
          />
        </div>
        {error?.field === 'name' ? (
          <span className="field-error">{error.text}</span>
        ) : (
          <span className="field-help">Không ghi khối vào tên, chọn khối ở ô bên dưới. Ví dụ Khối A.</span>
        )}
      </div>

      {editing ? (
        <div className="field">
          <label className="field-label" htmlFor="track-grade">
            Khối
          </label>
          <select id="track-grade" className="input" value={gradeLevelId} onChange={(e) => setGradeLevelId(e.target.value)}>
            <option value="">Mọi khối</option>
            {grades.map((g) => (
              <option key={g.gradeLevelId} value={g.gradeLevelId}>
                Khối {g.gradeLevelName}
              </option>
            ))}
          </select>
          <span className="field-help">Chỉ đổi được sang khối mà mọi lớp đang dùng loại lớp này đều thuộc về.</span>
        </div>
      ) : (
        <fieldset className="field track-grades">
          <legend className="field-label">Dùng cho khối</legend>
          <div className="track-grade-options">
            {grades.map((g) => (
              <label key={g.gradeLevelId} className={`track-grade-option${picked.includes(g.gradeLevelId) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={picked.includes(g.gradeLevelId)} onChange={() => toggleGrade(g.gradeLevelId)} />
                Khối {g.gradeLevelName}
              </label>
            ))}
          </div>
          <span className="field-help">
            Mỗi khối được chọn thành một loại lớp riêng, có môn học và số tiết riêng. Không chọn khối nào thì loại lớp
            dùng cho mọi khối.
          </span>
          {preview && <span className="caption muted">Sẽ tạo: {preview}</span>}
        </fieldset>
      )}

      <div className="field">
        <label className="field-label" htmlFor="track-description">
          Mô tả <span className="caption muted">Không bắt buộc</span>
        </label>
        <div className="input-wrap">
          <input
            id="track-description"
            className="input"
            value={form.description}
            onChange={set('description')}
            placeholder="Tự nhiên – trọng tâm Toán, Vật lí, Hoá học"
            maxLength={255}
          />
        </div>
      </div>

      {error && !error.field && (
        <p className="form-error" role="alert">
          {error.text}
        </p>
      )}

      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving
            ? 'Đang lưu…'
            : editing
              ? 'Lưu thay đổi'
              : picked.length > 1
                ? `Thêm ${picked.length} loại lớp`
                : 'Thêm loại lớp'}
        </button>
      </div>
    </form>
  );
}
