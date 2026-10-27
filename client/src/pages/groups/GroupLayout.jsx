import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { GROUP_TYPE_ICONS, GROUP_TYPE_LABELS } from './groupLabels.js';

// SCR-23 Group Detail – UC-30 View Group Detail: the group header and its tabs. The overview and members tabs are
// FE-04; FE-05 (Group Feed) and FE-06 (Messaging) add their tabs here as nested routes, shown only when the group's
// `canSeeContent` is true (never for the School Manager in class groups).
export default function GroupLayout() {
  const { id } = useParams();
  const { activeRole } = useAuth();
  const [state, setState] = useState({ loading: true, group: null, error: '' });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, group: null, error: '' });
    api
      .get(`/groups/${id}`)
      .then(({ data }) => alive && setState({ loading: false, group: data, error: '' }))
      .catch((err) => alive && setState({ loading: false, group: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [id]);

  const manager = activeRole === 'SCHOOL_MANAGER';
  const g = state.group;

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/
        {manager ? <Link to="/classes">Lớp & nhóm lớp</Link> : <Link to="/groups">Nhóm của tôi</Link>}/
        <span className="current">{g?.groupName ?? 'Nhóm'}</span>
      </nav>

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading ? (
        <p className="loading">Đang tải nhóm…</p>
      ) : (
        <>
          <header className="card card-outline group-header">
            <span className="group-header-icon">
              <Icon name={GROUP_TYPE_ICONS[g.groupType]} />
            </span>
            <div className="group-header-main">
              <p className="label-upper muted">
                {GROUP_TYPE_LABELS[g.groupType]}
                {g.schoolYear && ` · Năm học ${yearLabel(g.schoolYear.yearName)}`}
              </p>
              <h1 className="headline-lg">{g.groupName}</h1>
              <p className="group-header-meta caption">
                <span>
                  <Icon name="person" size="sm" /> {g.counts.total} thành viên
                  {g.class && ` (${g.counts.teachers} giáo viên, ${g.counts.students} học sinh, ${g.counts.parents} phụ huynh)`}
                </span>
                {g.class &&
                  (g.homeroom ? (
                    <span>
                      <Icon name="badge" size="sm" /> Giáo viên chủ nhiệm: {g.homeroom.fullName}
                      {g.homeroom.status === 'LOCKED' && ' (đã khoá)'}
                    </span>
                  ) : (
                    <span className="class-warn">
                      <Icon name="warning" size="sm" /> Lớp chưa có giáo viên chủ nhiệm
                    </span>
                  ))}
              </p>
            </div>
            {g.readOnly && <span className="pill">Chỉ xem</span>}
          </header>

          <nav className="group-tabs" aria-label="Mục của nhóm">
            <NavLink to="" end>
              <Icon name="info" size="sm" />
              Tổng quan
            </NavLink>
            <NavLink to="members">
              <Icon name="group" size="sm" />
              Thành viên ({g.counts.total})
            </NavLink>
          </nav>

          <Outlet context={g} />
        </>
      )}
    </>
  );
}
