import Icon from '../../components/Icon.jsx';

const SECTIONS = [
  { grade: '10', label: 'Khối 10' },
  { grade: '11', label: 'Khối 11' },
  { grade: '12', label: 'Khối 12' },
  { grade: null, label: 'Mọi khối' },
];

// SCR-70 left column: every class type (UC-26), grouped by the grade it belongs to. Counts are for the selected
// school year.
export default function TrackList({ tracks, selectedId, onSelect, onCreate }) {
  return (
    <section className="card card-outline year-list">
      <div className="year-list-head">
        <h2 className="title-sm">
          <Icon name="category" size="sm" />
          Danh sách loại lớp
        </h2>
        <button type="button" className="btn btn-tertiary" onClick={onCreate}>
          <Icon name="add" size="sm" />
          Thêm loại lớp
        </button>
      </div>

      {tracks.length === 0 ? (
        <p className="year-list-empty muted">Chưa có loại lớp nào. Thêm loại lớp đầu tiên để bắt đầu.</p>
      ) : (
        SECTIONS.map((section) => {
          const items = tracks.filter((t) => t.gradeLevel === section.grade);
          if (!items.length) return null;
          return (
            <div key={section.label} className="track-section">
              <p className="label-upper muted track-section-head">
                {section.label} <span className="tab-count">{items.length}</span>
              </p>
              <ul>
                {items.map((t) => (
                  <li key={t.trackId}>
                    <button
                      type="button"
                      className={`year-item${t.trackId === selectedId ? ' selected' : ''}`}
                      aria-current={t.trackId === selectedId ? 'true' : undefined}
                      onClick={() => onSelect(t.trackId)}
                    >
                      <span className="year-item-top">
                        <span className="year-item-name">{t.trackName}</span>
                        {t.subjectCount === 0 && <span className="pill amber">Chưa có môn</span>}
                      </span>
                      {t.description && <span className="track-item-desc">{t.description}</span>}
                      <span className="year-item-meta">
                        <Icon name="book" size="sm" />
                        {t.subjectCount} môn · {t.classCount} lớp
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      <p className="year-list-foot caption muted">Hiển thị {tracks.length} loại lớp</p>
    </section>
  );
}
