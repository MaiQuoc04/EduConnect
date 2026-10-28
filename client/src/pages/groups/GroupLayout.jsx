import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import { GROUP_TYPE_ICONS, GROUP_TYPE_LABELS, groupHasFeed } from './groupLabels.js';

// SCR-23 Group Detail – UC-30 View Group Detail: the group (or team, UC-35) header and its tabs. The overview and members tabs are
// FE-04; FE-05 (Group Feed) and FE-06 (Messaging) add their tabs here as nested routes, shown only when the group's
// `canSeeContent` is true (never for the School Manager in class groups). Teams can be left from here; the three
// class groups cannot.
export default function GroupLayout() {
  const { id } = useParams();
  const { activeRole } = useAuth();
  const [state, setState] = useState({ loading: true, group: null, error: '' });
  const [version, setVersion] = useState(0); // bumped after member changes (UC-32..34) to refresh the counts
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setState((s) => (s.group?.groupId === Number(id) ? s : { loading: true, group: null, error: '' }));
    api
      .get(`/groups/${id}`)
      .then(({ data }) => alive && setState({ loading: false, group: data, error: '' }))
      .catch((err) => alive && setState({ loading: false, group: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [id, version]);

  const manager = activeRole === 'SCHOOL_MANAGER';
  const g = state.group;
  const team = g?.groupType === 'TEAM_CHAT';
  // "10A1 – Nhóm chung"; teams and the teacher group keep their own name.
  const title = g && (g.class && !team ? `${g.class.className} – ${GROUP_TYPE_LABELS[g.groupType]}` : g.groupName);

  async function leaveTeam() {
    const { data } = await api.post(`/groups/${g.groupId}/leave`);
    toast(data.teamClosed ? `Bạn đã rời ${g.groupName}. Team không còn thành viên nên đã đóng.` : `Bạn đã rời ${g.groupName}.`);
    navigate('/groups', { replace: true });
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/
        {manager ? <Link to="/classes">Lớp & nhóm lớp</Link> : <Link to="/groups">Nhóm của tôi</Link>}/
        <span className="current">{title ?? 'Nhóm'}</span>
      </nav>

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading ? (
        <p className="loading">Đang tải nhóm…</p>
      ) : (
        <>
          <header className="gd-header">
            <div className="gd-header-main">
              <p className="gd-eyebrow">
                <span className={`my-badge ${team ? 'ink' : 'grey'}`}>{GROUP_TYPE_LABELS[g.groupType]}</span>
                {g.schoolYear && <span className="my-badge grey">Năm học {yearLabel(g.schoolYear.yearName)}</span>}
                {g.readOnly && <span className="my-badge amber">Chỉ xem</span>}
              </p>
              <div className="gd-title">
                <span className={`my-card-icon type-${g.groupType.toLowerCase()}`} aria-hidden="true">
                  <Icon name={GROUP_TYPE_ICONS[g.groupType]} />
                </span>
                <h1 className="headline-lg">{title}</h1>
              </div>
              <p className="gd-meta">
                <span>
                  <Icon name="group" size="sm" />
                  <strong>{g.counts.total} thành viên</strong>
                  {g.class && ` (${g.counts.teachers} giáo viên · ${g.counts.students} học sinh · ${g.counts.parents} phụ huynh)`}
                </span>
                {team
                  ? g.createdByName && (
                      <span>
                        <Icon name="edit" size="sm" /> Do {g.createdByName} tạo
                      </span>
                    )
                  : g.class &&
                    (g.homeroom ? (
                      <span>
                        <Icon name="badge" size="sm" /> GVCN: <strong>{g.homeroom.fullName}</strong>
                        {g.homeroom.status === 'LOCKED' && <span className="pill red">Đã khoá</span>}
                      </span>
                    ) : (
                      <span className="class-warn">
                        <Icon name="warning" size="sm" /> Lớp chưa có giáo viên chủ nhiệm
                      </span>
                    ))}
              </p>
            </div>
            <div className="gd-actions">
              <Link to="members" className="btn btn-secondary">
                <Icon name="group" size="sm" />
                Thành viên ({g.counts.total})
              </Link>
              {g.canLeave && (
                <button type="button" className="btn btn-secondary btn-danger" onClick={() => setLeaving(true)}>
                  <Icon name="logout" size="sm" />
                  Rời team
                </button>
              )}
            </div>
          </header>
          {leaving && (
            <ConfirmDialog
              title={`Rời ${g.groupName}?`}
              confirmLabel="Rời team"
              busyLabel="Đang rời…"
              icon="logout"
              onConfirm={leaveTeam}
              onCancel={() => setLeaving(false)}
            >
              {g.counts.total <= 1
                ? 'Bạn là thành viên cuối cùng. Rời đi thì team sẽ đóng và không ai xem được nữa.'
                : 'Bạn sẽ không xem được tin nhắn của team nữa và không thể tự quay lại. Các thành viên khác vẫn ở lại team.'}
            </ConfirmDialog>
          )}

          <div className="gd-tabbar">
            <nav className="group-tabs" aria-label="Mục của nhóm">
              <NavLink to="" end>
                <Icon name="info" size="sm" />
                Tổng quan
              </NavLink>
              {/* FE-05 / FE-06 tabs: only for people who may see the group's content. */}
              {g.canSeeContent && groupHasFeed(g.groupType) && (
                <NavLink to="feed">
                  <Icon name="dynamic_feed" size="sm" />
                  Bảng tin
                </NavLink>
              )}
              {g.canSeeContent && (
                <NavLink to={`/chat/${g.groupId}`}>
                  <Icon name="forum" size="sm" />
                  Trò chuyện
                </NavLink>
              )}
              <NavLink to="members">
                <Icon name="group" size="sm" />
                Thành viên <span className="gd-tab-count">{g.counts.total}</span>
              </NavLink>
            </nav>
            {!g.canSeeContent && (
              <span className="gd-lock caption">
                <Icon name="lock" size="sm" />
                Chỉ xem thông tin và thành viên
              </span>
            )}
          </div>

          <Outlet context={{ ...g, title, reload: () => setVersion((v) => v + 1) }} />
        </>
      )}
    </>
  );
}
