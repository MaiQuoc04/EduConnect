import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { fold } from '../subjects/subjectText.js';
import { GROUP_TYPE_HELP, GROUP_TYPE_ICONS, GROUP_TYPE_LABELS, groupHasFeed } from './groupLabels.js';
import TeamCreatePanel from './TeamCreatePanel.jsx';

const ROLE_LABELS = { STUDENT: 'Học sinh', PARENT: 'Phụ huynh' };
const SCOPE_TABS = [
  { value: '', label: 'Tất cả lớp' },
  { value: 'homeroom', label: 'Lớp chủ nhiệm' },
  { value: 'subject', label: 'Lớp bộ môn' },
];

// My role in a class, from the active role and whether I am its homeroom teacher.
function roleText(activeRole, cls) {
  if (activeRole === 'TEACHER') return cls.isHomeroom ? 'Giáo viên chủ nhiệm' : 'Giáo viên bộ môn';
  return ROLE_LABELS[activeRole] ?? 'Thành viên';
}

// SCR-22 Group List – UC-29 View Group List for teachers, students and parents ("Nhóm của tôi") and UC-35 Create
// Team Chat. One card per class holding all its groups and the user's teams there (homeroom classes first), plus
// the school-wide teacher group. A subject teacher only gets the general group of their classes (groupAccess.js).
// The School Manager uses the class view at /classes.
export default function GroupListPage() {
  const [params, setParams] = useSearchParams();
  const yearParam = params.get('schoolYearId') ?? '';
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [creating, setCreating] = useState(null); // null | { classId } while the "Tạo team" panel is open
  const [scope, setScope] = useState('');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { activeRole } = useAuth();
  const teacher = activeRole === 'TEACHER';

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api
      .get('/groups', { params: yearParam ? { schoolYearId: yearParam } : {} })
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [yearParam]);

  const data = state.data;
  const schoolYear = data?.schoolYear ?? null;
  const readOnly = Boolean(schoolYear?.ended);
  const classes = useMemo(
    () => [...(data?.classes ?? [])].sort((a, b) => Number(b.isHomeroom) - Number(a.isHomeroom)),
    [data],
  );
  const homeroomCount = classes.filter((c) => c.isHomeroom).length;
  const counts = { '': classes.length, homeroom: homeroomCount, subject: classes.length - homeroomCount };
  // The tabs only help a teacher who has both kinds of class.
  const showTabs = teacher && homeroomCount > 0 && homeroomCount < classes.length;

  const q = fold(query.trim());
  const shown = classes.filter(
    (c) =>
      (!scope || (scope === 'homeroom') === Boolean(c.isHomeroom)) &&
      (!q || fold(`lớp ${c.className}`).includes(q) || c.teams.some((t) => fold(t.groupName).includes(q))),
  );
  const teacherGroup = data?.teacherGroup;
  const showTeacherGroup = teacherGroup && !scope && (!q || fold(teacherGroup.groupName).includes(q));
  const empty = data && !classes.length && !teacherGroup;
  const showToolbar = showTabs || classes.length > 3 || data?.schoolYears.length > 1;

  function clearFilters() {
    setScope('');
    setQuery('');
  }

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Cộng đồng</span>/<span className="current">Nhóm của tôi</span>
      </nav>
      <div className="page-header my-groups-header">
        <div>
          <p className="my-groups-eyebrow">
            <span className="chip ink">Cộng đồng lớp học</span>
            {schoolYear && <span className="caption muted">Năm học {yearLabel(schoolYear.yearName)}</span>}
            {readOnly && <span className="pill">Chỉ xem</span>}
          </p>
          <h1 className="headline-lg">Nhóm của tôi</h1>
          <p>Nơi trao đổi với giáo viên, học sinh và phụ huynh trong các lớp bạn tham gia.</p>
        </div>
        {classes.length > 0 && !readOnly && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating({ classId: null })} disabled={Boolean(creating)}>
            <Icon name="add_circle" size="sm" />
            Tạo team
          </button>
        )}
      </div>

      {data && showToolbar && !empty && (
        <div className="card card-outline my-groups-toolbar">
          {showTabs && (
            <div className="pill-tabs" role="tablist" aria-label="Lọc lớp">
              {SCOPE_TABS.map((t) => (
                <button key={t.value} type="button" role="tab" aria-selected={scope === t.value} onClick={() => setScope(t.value)}>
                  {t.label} ({counts[t.value]})
                </button>
              ))}
            </div>
          )}
          <div className="my-groups-toolbar-right">
            {data.schoolYears.length > 1 && (
              <select
                className="input year-select"
                aria-label="Năm học"
                value={yearParam || (schoolYear ? String(schoolYear.schoolYearId) : '')}
                onChange={(e) => setParams({ schoolYearId: e.target.value })}
              >
                {data.schoolYears.map((y) => (
                  <option key={y.schoolYearId} value={y.schoolYearId}>
                    Năm học {yearLabel(y.yearName)}
                  </option>
                ))}
              </select>
            )}
            <div className="input-wrap subject-search my-groups-search">
              <Icon name="search" size="sm" className="subject-search-icon" />
              <input
                className="input"
                type="search"
                placeholder="Tìm lớp hoặc team…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Tìm lớp hoặc team"
              />
            </div>
          </div>
        </div>
      )}

      {creating && (
        <TeamCreatePanel
          classId={creating.classId}
          onCancel={() => setCreating(null)}
          onCreated={(groupId) => navigate(`/groups/${groupId}`)}
        />
      )}

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading && !data ? (
        <p className="loading">Đang tải nhóm…</p>
      ) : empty ? (
        <div className="card card-outline class-empty">
          <Icon name="groups" />
          <p>Bạn chưa thuộc nhóm lớp nào. Khi nhà trường xếp lớp, các nhóm của lớp sẽ hiện ở đây.</p>
        </div>
      ) : (
        <div className={`my-groups${state.loading ? ' is-loading' : ''}`}>
          {shown.length > 0 && (
            <div className="mc-grid">
              {shown.map((c) => (
                <ClassGroupsCard
                  key={c.classId}
                  cls={c}
                  teacher={teacher}
                  role={roleText(activeRole, c)}
                  readOnly={readOnly}
                  canCreateTeam={!readOnly && !creating}
                  onCreateTeam={() => setCreating({ classId: c.classId })}
                />
              ))}
            </div>
          )}

          {showTeacherGroup && (
            <section className="card card-outline mc-card mc-school" aria-labelledby="school-group">
              <header className="mc-head">
                <span className="my-card-icon type-teacher_school" aria-hidden="true">
                  <Icon name={GROUP_TYPE_ICONS.TEACHER_SCHOOL} />
                </span>
                <div className="mc-title">
                  <div className="mc-name">
                    <h2 id="school-group" className="title-sm">
                      Toàn trường
                    </h2>
                    <span className="my-badge grey">Nội bộ giáo viên</span>
                  </div>
                  <p className="caption muted">Toàn bộ giáo viên và quản lý trường</p>
                </div>
              </header>
              <ul className="mc-groups">
                <GroupRow group={teacherGroup} label={teacherGroup.groupName} />
              </ul>
            </section>
          )}

          {!shown.length && !showTeacherGroup && (
            <div className="card card-outline class-empty">
              <Icon name="search_off" />
              <p>Không tìm thấy lớp hoặc team phù hợp.</p>
              <button type="button" className="btn btn-tertiary" onClick={clearFilters}>
                Xoá bộ lọc
              </button>
            </div>
          )}

          <aside className="card card-outline my-groups-rules">
            <span className="my-groups-rules-icon" aria-hidden="true">
              <Icon name="menu_book" />
            </span>
            <div>
              <p className="title-sm">Cách các nhóm hoạt động</p>
              <p className="muted">
                Nhóm chung có bảng tin và trò chuyện; nhóm học sinh và nhóm phụ huynh chỉ dùng để trò chuyện. Theo mặc
                định, bài đăng trong nhóm chung cần giáo viên chủ nhiệm duyệt. Team chỉ để trò chuyện, gồm các thành
                viên của cùng một lớp.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// One class: its groups as rows (open, feed, chat) and the user's teams in the class.
function ClassGroupsCard({ cls, teacher, role, readOnly, canCreateTeam, onCreateTeam }) {
  return (
    <section className={`card card-outline mc-card${cls.isHomeroom ? ' is-homeroom' : ''}`} aria-labelledby={`class-${cls.classId}`}>
      <header className="mc-head">
        <span className="mc-grade" aria-hidden="true">
          {cls.gradeLevel}
        </span>
        <div className="mc-title">
          <div className="mc-name">
            <h2 id={`class-${cls.classId}`} className="title-sm">
              Lớp {cls.className}
            </h2>
            {teacher && (
              <span className={`my-badge ${cls.isHomeroom ? 'ink' : 'amber'}`}>{cls.isHomeroom ? 'Chủ nhiệm' : 'Bộ môn'}</span>
            )}
            {readOnly && <span className="my-badge grey">Chỉ xem</span>}
          </div>
          <p className="caption muted">
            Vai trò của tôi: <strong>{role}</strong>
            {!cls.isHomeroom &&
              (cls.homeroomName ? (
                <>
                  {' '}
                  · GVCN {cls.homeroomName}
                  {cls.homeroomStatus === 'LOCKED' && ' (đã khoá)'}
                </>
              ) : (
                <span className="class-warn"> · Chưa có GVCN</span>
              ))}
          </p>
        </div>
      </header>

      <ul className="mc-groups" aria-label={`Nhóm của lớp ${cls.className}`}>
        {cls.groups.map((g) => (
          <GroupRow key={g.groupId} group={g} label={GROUP_TYPE_LABELS[g.groupType]} />
        ))}
      </ul>

      {(cls.teams.length > 0 || canCreateTeam) && (
        <div className="mc-teams">
          <span className="label-upper">Team{cls.teams.length ? ` (${cls.teams.length})` : ''}</span>
          <div className="mc-team-list">
            {cls.teams.map((t) => (
              <Link key={t.groupId} to={`/chat/${t.groupId}`} className="mc-team" title={t.createdByName ? `Do ${t.createdByName} tạo` : undefined}>
                <Icon name={GROUP_TYPE_ICONS.TEAM_CHAT} size="sm" />
                {t.groupName}
                <span className="mc-team-count">{t.memberCount}</span>
              </Link>
            ))}
            {canCreateTeam && (
              <button type="button" className="mc-team is-new" onClick={onCreateTeam}>
                <Icon name="add" size="sm" />
                Tạo team
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// One group inside a card: the name opens the group; the icons jump to its feed and chat.
function GroupRow({ group, label }) {
  const type = group.groupType;
  return (
    <li className="mc-row">
      <Link to={`/groups/${group.groupId}`} className="mc-row-main">
        <span className={`gd-mini-icon type-${type.toLowerCase()}`} aria-hidden="true">
          <Icon name={GROUP_TYPE_ICONS[type]} size="sm" />
        </span>
        <span className="mc-row-text">
          <span className="mc-row-name">{label}</span>
          <span className="caption muted">
            {group.memberCount} thành viên · {GROUP_TYPE_HELP[type]}
          </span>
        </span>
      </Link>
      <span className="mc-row-actions">
        {groupHasFeed(type) && (
          <Link to={`/groups/${group.groupId}/feed`} className="btn-icon mc-icon-btn" title="Bảng tin" aria-label={`Bảng tin ${label}`}>
            <Icon name="dynamic_feed" size="sm" />
          </Link>
        )}
        <Link to={`/chat/${group.groupId}`} className="btn-icon mc-icon-btn" title="Trò chuyện" aria-label={`Trò chuyện ${label}`}>
          <Icon name="forum" size="sm" />
        </Link>
      </span>
    </li>
  );
}
