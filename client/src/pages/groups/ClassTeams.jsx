import Icon from '../../components/Icon.jsx';
import GroupLink from './GroupLink.jsx';

// The user's teams in one class (UC-35), with the "Tạo team" button when a team can still be created there.
export default function ClassTeams({ teams, canCreate, onCreate }) {
  if (!teams.length && !canCreate) return null;
  return (
    <div className="class-teams">
      <div className="class-teams-head">
        <span className="label-upper muted">Team của lớp{teams.length ? ` (${teams.length})` : ''}</span>
        {canCreate && (
          <button type="button" className="btn btn-tertiary" onClick={onCreate}>
            <Icon name="add" size="sm" />
            Tạo team
          </button>
        )}
      </div>
      {teams.length ? (
        <div className="group-links">
          {teams.map((t) => (
            <GroupLink key={t.groupId} group={t} />
          ))}
        </div>
      ) : (
        <p className="caption muted">Chưa có team. Team giúp trò chuyện riêng theo tổ, môn học hoặc nhiệm vụ.</p>
      )}
    </div>
  );
}
