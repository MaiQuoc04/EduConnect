import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { GROUP_TYPE_HELP, GROUP_TYPE_ICONS, GROUP_TYPE_LABELS } from './groupLabels.js';

// One group or team as a row link (Group List cards, other groups and teams of the class).
export default function GroupLink({ group }) {
  const team = group.groupType === 'TEAM_CHAT';
  return (
    <Link to={`/groups/${group.groupId}`} className="group-link">
      <Icon name={GROUP_TYPE_ICONS[group.groupType]} className="group-link-icon" />
      <span className="group-link-text">
        <span className="group-link-name">{team ? group.groupName : GROUP_TYPE_LABELS[group.groupType]}</span>
        <span className="caption muted">
          {team && group.createdByName ? `Do ${group.createdByName} tạo` : GROUP_TYPE_HELP[group.groupType]}
        </span>
      </span>
      {group.memberCount !== undefined && <span className="caption muted group-link-count">{group.memberCount} thành viên</span>}
      <Icon name="chevron_right" size="sm" className="muted" />
    </Link>
  );
}
