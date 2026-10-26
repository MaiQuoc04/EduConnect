import Icon from '../../components/Icon.jsx';
import { formatDate } from '../../utils/format.js';
import SemesterSection from './SemesterSection.jsx';
import { YEAR_STATUS, yearLabel } from './schoolYearLabels.js';

// SCR-18 right column: the selected school year (UC-20) and its semesters (UC-21).
export default function SchoolYearDetail({ year, onEdit, onChanged }) {
  const status = YEAR_STATUS[year.status] ?? YEAR_STATUS.ENDED;
  const ended = year.status === 'ENDED';

  return (
    <div className="stack">
      <section className="card card-outline">
        <div className="year-detail-head">
          <span className="year-detail-icon">
            <Icon name="account_balance" />
          </span>
          <div>
            <p className="label-upper muted">Hồ sơ năm học</p>
            <h2 className="title-md">Năm học {yearLabel(year.yearName)}</h2>
          </div>
          {!ended && (
            <button type="button" className="btn btn-secondary push" onClick={onEdit}>
              <Icon name="edit" size="sm" />
              Chỉnh sửa năm học
            </button>
          )}
        </div>

        <dl className="year-facts">
          <div>
            <dt>Ngày bắt đầu</dt>
            <dd className="mono">{formatDate(year.startDate)}</dd>
          </div>
          <div>
            <dt>Ngày kết thúc</dt>
            <dd className="mono">{formatDate(year.endDate)}</dd>
          </div>
          <div>
            <dt>Trạng thái</dt>
            <dd>
              <span className={`pill ${status.pill}`}>{status.label}</span>
            </dd>
          </div>
          <div>
            <dt>Số lớp</dt>
            <dd>{year.classCount} lớp</dd>
          </div>
        </dl>

        {ended && (
          <p className="caption muted year-detail-note">Năm học đã kết thúc nên không thể chỉnh sửa.</p>
        )}
      </section>

      <SemesterSection year={year} onChanged={onChanged} />
    </div>
  );
}
