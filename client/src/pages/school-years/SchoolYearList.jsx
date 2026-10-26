import Icon from '../../components/Icon.jsx';
import { formatDate } from '../../utils/format.js';
import { YEAR_STATUS, yearLabel } from './schoolYearLabels.js';

// SCR-18 left column: every school year, newest first (UC-20).
export default function SchoolYearList({ years, selectedId, onSelect, onCreate }) {
  return (
    <section className="card card-outline year-list">
      <div className="year-list-head">
        <h2 className="title-sm">
          <Icon name="calendar_month" size="sm" />
          Danh sách năm học
        </h2>
        <button type="button" className="btn btn-tertiary" onClick={onCreate}>
          <Icon name="add" size="sm" />
          Thêm năm học
        </button>
      </div>

      {years.length === 0 ? (
        <p className="year-list-empty muted">Chưa có năm học nào. Thêm năm học đầu tiên để bắt đầu.</p>
      ) : (
        <ul>
          {years.map((y) => {
            const status = YEAR_STATUS[y.status] ?? YEAR_STATUS.ENDED;
            return (
              <li key={y.schoolYearId}>
                <button
                  type="button"
                  className={`year-item${y.schoolYearId === selectedId ? ' selected' : ''}`}
                  aria-current={y.schoolYearId === selectedId ? 'true' : undefined}
                  onClick={() => onSelect(y.schoolYearId)}
                >
                  <span className="year-item-top">
                    <span className="year-item-name">{yearLabel(y.yearName)}</span>
                    <span className={`pill ${status.pill}`}>{status.label}</span>
                  </span>
                  <span className="year-item-meta mono">
                    <Icon name="date_range" size="sm" />
                    {formatDate(y.startDate)} – {formatDate(y.endDate)}
                  </span>
                  <span className="year-item-meta">
                    <Icon name="checklist" size="sm" />
                    {y.semesterCount ? `${y.semesterCount} học kỳ` : 'Chưa có học kỳ'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="year-list-foot caption muted">Hiển thị {years.length} năm học</p>
    </section>
  );
}
