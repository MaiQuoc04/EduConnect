import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { GROUP_TYPE_ICONS, GROUP_TYPE_LABELS } from '../groups/groupLabels.js';

const GROUP_ORDER = ['GENERAL', 'STUDENT', 'PARENT'];

// One class on SCR-22 (UC-29): homeroom teacher, head count and its three groups. Each group row opens the group's
// members – the School Manager never opens a class feed or chat from here.
export default function ClassCard({ cls }) {
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
          <dd className="mono">{cls.studentCount} học sinh</dd>
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
