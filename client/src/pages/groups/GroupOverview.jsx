import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate } from '../../utils/format.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import ClassTeams from './ClassTeams.jsx';
import GroupLink from './GroupLink.jsx';
import { GROUP_TYPE_HELP, GROUP_TYPE_LABELS } from './groupLabels.js';
import TeamCreatePanel from './TeamCreatePanel.jsx';

// SCR-23 – UC-30 View Group Detail, overview tab: the group's (or team's) information, the class's other groups and
// "Team của lớp" with UC-35 Create Team Chat (teachers, students and parents; never the School Manager).
export default function GroupOverview() {
  const g = useOutletContext();
  const { activeRole } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const team = g.groupType === 'TEAM_CHAT';
  const others = g.classGroups.filter((x) => x.groupId !== g.groupId);
  const teams = g.teams.filter((x) => x.groupId !== g.groupId);
  const canCreateTeam = Boolean(g.class) && !g.readOnly && activeRole !== 'SCHOOL_MANAGER' && !creating;

  return (
    <div className="group-overview">
      <section className="card card-outline">
        <h2 className="title-md card-title">
          <Icon name="info" />
          {team ? 'Thông tin team' : 'Thông tin nhóm'}
        </h2>
        <dl className="dl">
          <div>
            <dt>Loại nhóm</dt>
            <dd>{GROUP_TYPE_LABELS[g.groupType]}</dd>
          </div>
          <div>
            <dt>Thành viên</dt>
            <dd>{GROUP_TYPE_HELP[g.groupType]}</dd>
          </div>
          {g.class && (
            <>
              <div>
                <dt>Lớp</dt>
                <dd>
                  {g.class.className} · Khối {g.class.gradeLevel}
                </dd>
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
                <dt>Giáo viên chủ nhiệm</dt>
                <dd className={g.homeroom ? '' : 'empty'}>{g.homeroom?.fullName ?? 'Chưa có'}</dd>
              </div>
            </>
          )}
          {team && (
            <div>
              <dt>Người tạo</dt>
              <dd>{g.createdByName ?? '—'}</dd>
            </div>
          )}
          {g.groupType === 'GENERAL' || g.groupType === 'TEACHER_SCHOOL' ? (
            <div>
              <dt>Duyệt bài đăng</dt>
              <dd>{g.requireApproval ? 'Bật' : 'Tắt'}</dd>
            </div>
          ) : null}
          <div>
            <dt>Ngày tạo</dt>
            <dd>{formatDate(g.createdAt)}</dd>
          </div>
        </dl>
      </section>

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

      {others.length > 0 && (
        <section className="card card-outline">
          <h2 className="title-md card-title">
            <Icon name="account_tree" />
            {team ? 'Nhóm' : 'Nhóm khác'} của lớp {g.class.className}
          </h2>
          <div className="group-links">
            {others.map((x) => (
              <GroupLink key={x.groupId} group={x} />
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
      {g.class && g.canSeeContent && (teams.length > 0 || canCreateTeam) && (
        <section className="card card-outline">
          <ClassTeams teams={teams} canCreate={canCreateTeam} onCreate={() => setCreating(true)} />
        </section>
      )}
    </div>
  );
}
