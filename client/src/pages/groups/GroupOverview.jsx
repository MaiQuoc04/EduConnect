import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate } from '../../utils/format.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { GROUP_TYPE_DESC, GROUP_TYPE_HELP, GROUP_TYPE_ICONS, GROUP_TYPE_LABELS, groupHasFeed } from './groupLabels.js';
import TeamCreatePanel from './TeamCreatePanel.jsx';

// SCR-23 – UC-30 View Group Detail, overview tab: what the group is for, the class's other groups and "Team của lớp"
// with UC-35 Create Team Chat (teachers, students and parents; never the School Manager) on the left; class
// information and who the members are on the right.
export default function GroupOverview() {
  const g = useOutletContext();
  const { activeRole } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const team = g.groupType === 'TEAM_CHAT';
  const others = g.classGroups.filter((x) => x.groupId !== g.groupId);
  const teams = g.teams.filter((x) => x.groupId !== g.groupId);
  const canCreateTeam = Boolean(g.class) && !g.readOnly && activeRole !== 'SCHOOL_MANAGER' && !creating;
  const showTeams = g.class && g.canSeeContent && (teams.length > 0 || canCreateTeam);
  const feed = groupHasFeed(g.groupType);
  const kinds = g.class
    ? [
        { label: 'Giáo viên', value: g.counts.teachers, tone: 'ink' },
        { label: 'Học sinh', value: g.counts.students, tone: 'green' },
        { label: 'Phụ huynh', value: g.counts.parents, tone: 'blue' },
      ]
    : [];

  return (
    <div className="gd-body">
      <div className="gd-main">
        <section className="card card-outline gd-card">
          <h2 className="title-sm gd-card-title">
            <Icon name="info" />
            {team ? 'Về team này' : 'Về nhóm này'}
          </h2>
          <p className="gd-desc">{GROUP_TYPE_DESC[g.groupType]}</p>
          <ul className="gd-features">
            <li className={feed ? 'is-on' : ''}>
              {feed && g.canSeeContent ? (
                <Link to="feed">
                  <Icon name="dynamic_feed" size="sm" />
                  Bảng tin
                </Link>
              ) : (
                <>
                  <Icon name={feed ? 'check_circle' : 'block'} size="sm" />
                  Bảng tin
                </>
              )}
            </li>
            <li className="is-on">
              {g.canSeeContent ? (
                <Link to={`/chat/${g.groupId}`}>
                  <Icon name="forum" size="sm" />
                  Trò chuyện
                </Link>
              ) : (
                <>
                  <Icon name="check_circle" size="sm" />
                  Trò chuyện
                </>
              )}
            </li>
            {feed && (
              <li className={g.requireApproval ? 'is-on' : ''}>
                <Icon name={g.requireApproval ? 'verified' : 'remove_done'} size="sm" />
                {g.requireApproval ? 'Bài đăng cần duyệt' : 'Bài đăng không cần duyệt'}
              </li>
            )}
          </ul>
          {g.readOnly && (
            <div className="notice">
              <Icon name="history" />
              <p>Năm học của nhóm đã kết thúc nên nhóm chỉ còn để xem lại.</p>
            </div>
          )}
          {!g.canSeeContent && (
            <div className="notice ink">
              <Icon name="lock" />
              <p>Quản lý trường chỉ xem thông tin và danh sách thành viên, không xem bảng tin và tin nhắn của nhóm lớp.</p>
            </div>
          )}
        </section>

        {others.length > 0 && (
          <section className="card card-outline gd-card">
            <h2 className="title-sm gd-card-title">
              <Icon name="account_tree" />
              {team ? 'Nhóm' : 'Nhóm khác'} của lớp {g.class.className}
            </h2>
            <div className="my-subchannels">
              {others.map((x) => (
                <Link key={x.groupId} to={`/groups/${x.groupId}`} className="my-subchannel">
                  <span className={`gd-mini-icon type-${x.groupType.toLowerCase()}`} aria-hidden="true">
                    <Icon name={GROUP_TYPE_ICONS[x.groupType]} size="sm" />
                  </span>
                  <span className="my-subchannel-text">
                    <span className="my-subchannel-name">{GROUP_TYPE_LABELS[x.groupType]}</span>
                    <span className="caption muted">
                      {x.memberCount !== undefined ? `${x.memberCount} thành viên` : GROUP_TYPE_HELP[x.groupType]}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {creating && (
          <TeamCreatePanel
            classId={g.class.classId}
            onCancel={() => setCreating(false)}
            onCreated={(groupId) => {
              setCreating(false);
              navigate(`/groups/${groupId}`);
            }}
          />
        )}
        {showTeams && (
          <section className="card card-outline gd-card">
            <h2 className="title-sm gd-card-title">
              <Icon name="forum" />
              Team của lớp{teams.length ? ` (${teams.length})` : ''}
            </h2>
            <div className="my-subchannels">
              {teams.map((t) => (
                <Link key={t.groupId} to={`/groups/${t.groupId}`} className="my-subchannel">
                  <Icon name={GROUP_TYPE_ICONS.TEAM_CHAT} size="sm" className="my-subchannel-icon" />
                  <span className="my-subchannel-text">
                    <span className="my-subchannel-name">{t.groupName}</span>
                    <span className="caption muted">
                      {t.memberCount} thành viên{t.createdByName ? ` · Do ${t.createdByName} tạo` : ''}
                    </span>
                  </span>
                </Link>
              ))}
              {canCreateTeam && (
                <button type="button" className="my-subchannel is-new" onClick={() => setCreating(true)}>
                  <Icon name="add" size="sm" className="my-subchannel-icon" />
                  <span className="my-subchannel-text">
                    <span className="my-subchannel-name">Tạo team mới</span>
                    <span className="caption muted">Trò chuyện riêng theo tổ hoặc nhiệm vụ</span>
                  </span>
                </button>
              )}
            </div>
          </section>
        )}
      </div>

      <aside className="gd-side">
        <section className="card card-outline gd-card">
          <h2 className="title-sm gd-card-title">
            <Icon name={g.class ? 'school' : 'info'} />
            {g.class ? `Thông tin lớp ${g.class.className}` : 'Thông tin nhóm'}
          </h2>
          <dl className="gd-facts">
            {g.class && (
              <>
                <div>
                  <dt>Khối</dt>
                  <dd>Khối {g.class.gradeLevel}</dd>
                </div>
                <div>
                  <dt>Loại lớp</dt>
                  <dd>{g.class.trackName}</dd>
                </div>
                <div>
                  <dt>Năm học</dt>
                  <dd>
                    {yearLabel(g.schoolYear.yearName)}
                    {g.schoolYear.ended && ' (đã kết thúc)'}
                  </dd>
                </div>
                <div>
                  <dt>GVCN</dt>
                  <dd className={g.homeroom ? '' : 'class-warn'}>{g.homeroom?.fullName ?? 'Chưa có'}</dd>
                </div>
              </>
            )}
            {team && (
              <div>
                <dt>Người tạo</dt>
                <dd>{g.createdByName ?? '—'}</dd>
              </div>
            )}
            <div>
              <dt>Ngày tạo</dt>
              <dd>{formatDate(g.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="card card-outline gd-card">
          <div className="gd-card-head">
            <h2 className="title-sm gd-card-title">
              <Icon name="group" />
              Thành viên
            </h2>
            <Link to="members" className="caption">
              Xem danh sách
            </Link>
          </div>
          <p className="gd-total">
            {g.counts.total}
            <span> thành viên</span>
          </p>
          {kinds.length > 0 && (
            <ul className="gd-kinds">
              {kinds.map((k) => (
                <li key={k.label}>
                  <span className="gd-kind-label">{k.label}</span>
                  <span className="gd-kind-bar" aria-hidden="true">
                    <span
                      className={`gd-kind-fill ${k.tone}`}
                      style={{ width: `${g.counts.total ? Math.round((k.value / g.counts.total) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="gd-kind-value mono">{k.value}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="caption muted">{GROUP_TYPE_HELP[g.groupType]}.</p>
        </section>
      </aside>
    </div>
  );
}
