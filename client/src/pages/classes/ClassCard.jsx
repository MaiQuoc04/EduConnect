import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { DEFAULT_SIZE_LIMITS } from './studentPick.js';
import { GROUP_TYPE_ICONS, GROUP_TYPE_LABELS } from '../groups/groupLabels.js';

const GROUP_ORDER = ['GENERAL', 'STUDENT', 'PARENT'];

// One class on SCR-20 (UC-29): homeroom teacher, head count and its three groups. Each group row opens the group's
// members – the School Manager never opens a class feed or chat from here. `onAddStudents` (UC-28) is set while the
// school year is open. Class size (27/11/2026): above the recommended size an amber label, at or above the hard cap
// no more students (a class can be above it after the School Manager lowered the setting).
export default function ClassCard({ cls, sizeLimits = DEFAULT_SIZE_LIMITS, onAddStudents }) {
  const full = cls.studentCount >= sizeLimits.maxStudents;
  const overMax = cls.studentCount > sizeLimits.maxStudents;
  const overWarn = cls.studentCount > sizeLimits.warnStudents;
  const groups = [...cls.groups].sort((a, b) => GROUP_ORDER.indexOf(a.groupType) - GROUP_ORDER.indexOf(b.groupType));
  return (
    <article className="card card-outline class-card">
      <header className="class-card-head">
        <span className="class-card-grade" aria-hidden="true">
          {cls.gradeLevel}
        </span>
        <div className="class-card-title">
          <h3 className="title-sm">Lớp {cls.className}</h3>
          <p className="caption muted">{cls.trackName}</p>
        </div>
      </header>

      <dl className="class-card-meta">
        <div>
          <dt>
            <Icon name="person" size="sm" />
            GVCN
          </dt>
          <dd>
            {cls.homeroomName ? (
              <>
                <span className="class-card-teacher">{cls.homeroomName}</span>
                {cls.homeroomStatus === 'LOCKED' && <span className="pill red">Đã khoá</span>}
              </>
            ) : (
              <span className="class-warn">Chưa phân công</span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            <Icon name="badge" size="sm" />
            Sĩ số
          </dt>
          <dd>
            <span className="mono">
              {cls.studentCount}/{sizeLimits.maxStudents} học sinh
            </span>
            {overMax ? (
              <span className="pill red" title={`Sĩ số tối đa hiện là ${sizeLimits.maxStudents}`}>Vượt sĩ số tối đa</span>
            ) : overWarn && (
              <span className="pill amber" title={`Sĩ số khuyến nghị là ${sizeLimits.warnStudents}`}>Vượt khuyến nghị</span>
            )}
            {onAddStudents &&
              (full ? (
                !overMax && <span className="pill">Đủ sĩ số</span>
              ) : (
                <button type="button" className="link-button class-card-add" onClick={() => onAddStudents(cls)}>
                  <Icon name="person_add" size="sm" />
                  Thêm
                </button>
              ))}
          </dd>
        </div>
      </dl>

      <ul className="class-card-groups" aria-label={`Các nhóm của lớp ${cls.className}`}>
        {groups.map((g) => (
          <li key={g.groupId}>
            <Link to={`/groups/${g.groupId}/members`} className={`class-group-row type-${g.groupType.toLowerCase()}`} title={g.groupName}>
              <Icon name={GROUP_TYPE_ICONS[g.groupType]} size="sm" className="class-group-icon" />
              <span className="class-group-name">{GROUP_TYPE_LABELS[g.groupType]}</span>
              <span className="class-group-count mono">{g.memberCount}</span>
              <Icon name="chevron_right" size="sm" className="class-group-arrow" />
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
