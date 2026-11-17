import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';

const SECTIONS = [
  { grade: '10', label: 'Khối 10', badge: '10' },
  { grade: '11', label: 'Khối 11', badge: '11' },
  { grade: '12', label: 'Khối 12', badge: '12' },
  { grade: null, label: 'Mọi khối', badge: 'Tất cả' },
];
const keyOf = (grade) => grade ?? 'all';

// SCR-70 left column: every class type (UC-26), one grade at a time (tabs), so two types with the same name in
// different grades ("Khối E" of grade 10 and of grade 11) are never shown side by side. Each card also carries its
// grade in a badge. The tab follows the selected type (a type just created or opened from a link shows its grade).
// Counts are for the selected school year.
export default function TrackList({ tracks, selectedId, onSelect, onCreate }) {
  const selectedGrade = tracks.find((t) => t.trackId === selectedId)?.gradeLevel;
  const firstWithTracks = SECTIONS.find((s) => tracks.some((t) => t.gradeLevel === s.grade));
  const [active, setActive] = useState(() =>
    keyOf(selectedGrade !== undefined ? selectedGrade : (firstWithTracks?.grade ?? SECTIONS[0].grade)),
  );

  // Another type selected (create, delete, link): show its grade.
  useEffect(() => {
    if (selectedGrade !== undefined) setActive(keyOf(selectedGrade));
  }, [selectedId, selectedGrade]);

  const section = SECTIONS.find((s) => keyOf(s.grade) === active) ?? SECTIONS[0];
  const items = tracks.filter((t) => t.gradeLevel === section.grade);

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
        <>
          <div className="track-tabs-wrap">
            <div className="tabs track-tabs" role="tablist" aria-label="Lọc theo khối">
              {SECTIONS.map((s) => {
                const count = tracks.filter((t) => t.gradeLevel === s.grade).length;
                return (
                  <button
                    key={keyOf(s.grade)}
                    type="button"
                    role="tab"
                    aria-selected={keyOf(s.grade) === active}
                    onClick={() => setActive(keyOf(s.grade))}
                  >
                    {s.label}
                    <span className="tab-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="year-list-empty muted">
              {section.grade ? `${section.label} chưa có loại lớp nào.` : 'Chưa có loại lớp nào dùng chung cho mọi khối.'}
            </p>
          ) : (
            <ul role="tabpanel" aria-label={section.label}>
              {items.map((t) => (
                <li key={t.trackId}>
                  <button
                    type="button"
                    className={`year-item track-item${t.trackId === selectedId ? ' selected' : ''}`}
                    aria-current={t.trackId === selectedId ? 'true' : undefined}
                    aria-label={`${t.trackName}, ${section.grade ? section.label.toLowerCase() : 'mọi khối'}`}
                    onClick={() => onSelect(t.trackId)}
                  >
                    <span className={`track-grade${section.grade ? '' : ' is-all'}`} aria-hidden="true">
                      {section.grade && <span className="track-grade-label">Khối</span>}
                      {section.badge}
                    </span>
                    <span className="track-item-body">
                      <span className="year-item-top">
                        <span className="year-item-name">{t.trackName}</span>
                        {t.subjectCount === 0 && <span className="pill amber">Chưa có môn</span>}
                      </span>
                      {t.description && <span className="track-item-desc">{t.description}</span>}
                      <span className="year-item-meta">
                        <Icon name="book" size="sm" />
                        {t.subjectCount} môn · {t.classCount} lớp
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="year-list-foot caption muted">
        {tracks.length === 0 ? 'Hiển thị 0 loại lớp' : `${section.label}: ${items.length} / ${tracks.length} loại lớp`}
      </p>
    </section>
  );
}
