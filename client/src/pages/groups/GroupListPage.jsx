import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';
import { fold } from '../subjects/subjectText.js';
import { GROUP_TYPE_DESC, GROUP_TYPE_ICONS, GROUP_TYPE_LABELS } from './groupLabels.js';
import TeamCreatePanel from './TeamCreatePanel.jsx';

const ROLE_LABELS = { STUDENT: 'Học sinh', PARENT: 'Phụ huynh' };
const SCOPE_TABS = [
  { value: '', label: 'Tất cả nhóm' },
  { value: 'homeroom', label: 'Lớp chủ nhiệm' },
  { value: 'subject', label: 'Lớp bộ môn' },
  { value: 'school', label: 'Toàn trường' },
];

// My role in a group, from the active role and whether I am the class's homeroom teacher.
function roleText(activeRole, cls) {
  if (!cls) return 'Giáo viên';
  if (activeRole === 'TEACHER') return cls.isHomeroom ? 'Giáo viên chủ nhiệm' : 'Giáo viên bộ môn';
  return ROLE_LABELS[activeRole] ?? 'Thành viên';
}

// Small label on a card: what kind of group it is for me.
function badgeOf(item, activeRole) {
  const { group, cls } = item;
  if (group.groupType === 'TEACHER_SCHOOL') return { text: 'Nội bộ giáo viên', tone: 'grey' };
  if (group.groupType === 'TEAM_CHAT') return { text: 'Team', tone: 'ink' };
  if (group.groupType === 'STUDENT') return { text: 'Học sinh', tone: 'green' };
  if (group.groupType === 'PARENT') return { text: 'Phụ huynh', tone: 'blue' };
  if (activeRole === 'TEACHER') return cls.isHomeroom ? { text: 'Chủ nhiệm', tone: 'ink' } : { text: 'Bộ môn', tone: 'amber' };
  return { text: 'Nhóm lớp', tone: 'ink' };
}

const titleOf = ({ group, cls }) =>
  !cls ? group.groupName : `${cls.className} – ${group.groupType === 'TEAM_CHAT' ? group.groupName : GROUP_TYPE_LABELS[group.groupType]}`;

// SCR-22 Group List – UC-29 View Group List for teachers, students and parents ("Nhóm của tôi") and UC-35 Create
// Team Chat. The general group of the homeroom class (students / parents: of their first class) is the featured
// card with the class's teams; every other group or team is a card. A subject teacher only sees the general group
// of their classes (groupAccess.js). The School Manager uses the class view at /classes.
export default function GroupListPage() {
  const [params, setParams] = useSearchParams();
  const yearParam = params.get('schoolYearId') ?? '';
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [creating, setCreating] = useState(false); // the "Tạo team" panel
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

  // Featured class first, then every group and team as one flat list of cards.
  const { featured, items } = useMemo(() => {
    const classes = [...(data?.classes ?? [])].sort((a, b) => Number(b.isHomeroom) - Number(a.isHomeroom));
    const featuredClass = teacher ? classes.find((c) => c.isHomeroom) : classes[0];
    const featuredGroup = featuredClass?.groups.find((g) => g.groupType === 'GENERAL');
    const scopeOf = (cls) => (!teacher ? 'class' : cls.isHomeroom ? 'homeroom' : 'subject');
    const list = [];
    classes.forEach((cls) => {
      cls.groups.forEach((group) => {
        if (group !== featuredGroup) list.push({ key: `g${group.groupId}`, group, cls, scope: scopeOf(cls) });
      });
      if (!featuredGroup || cls !== featuredClass) {
        cls.teams.forEach((group) => list.push({ key: `t${group.groupId}`, group, cls, scope: scopeOf(cls) }));
      }
    });
    if (data?.teacherGroup) list.push({ key: 'school', group: data.teacherGroup, cls: null, scope: 'school' });
    return {
      featured: featuredGroup ? { group: featuredGroup, cls: featuredClass, scope: scopeOf(featuredClass) } : null,
      items: list,
    };
  }, [data, teacher]);

  // Cards per tab; the featured card counts with its teams.
  const counts = useMemo(() => {
    const scopes = items.map((i) => i.scope);
    if (featured) scopes.push(...Array(1 + featured.cls.teams.length).fill(featured.scope));
    return Object.fromEntries(SCOPE_TABS.map((t) => [t.value, scopes.filter((s) => !t.value || s === t.value).length]));
  }, [featured, items]);

  const matches = (item) => {
    const q = fold(query.trim());
    return (!scope || item.scope === scope) && (!q || fold(titleOf(item)).includes(q));
  };
  const showFeatured = featured && (!scope || featured.scope === scope) && (!query.trim() || matches(featured));
  const shown = items.filter(matches);
  const empty = data && !featured && !items.length;
  const showToolbar = teacher || items.length > 4 || data?.schoolYears.length > 1;
  const tabs = SCOPE_TABS.filter((t) => !t.value || counts[t.value] > 0);
  const filtered = Boolean(scope || query.trim());

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
        {!empty && data && !readOnly && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} disabled={creating}>
            <Icon name="add_circle" size="sm" />
            Tạo team
          </button>
        )}
      </div>

      {data && showToolbar && !empty && (
        <div className="card card-outline my-groups-toolbar">
          {teacher && (
            <div className="pill-tabs" role="tablist" aria-label="Lọc nhóm">
              {tabs.map((t) => (
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
                placeholder="Tìm theo tên nhóm, lớp…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Tìm nhóm"
              />
            </div>
          </div>
        </div>
      )}

      {creating && (
        <TeamCreatePanel
          classId={null}
          onCancel={() => setCreating(false)}
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
          {showFeatured && (
            <FeaturedGroup item={featured} activeRole={activeRole} canCreate={!readOnly && !creating} onCreate={() => setCreating(true)} />
          )}

          {shown.length > 0 && (
            <div className="my-group-grid">
              {shown.map((item) => (
                <GroupCard key={item.key} item={item} activeRole={activeRole} />
              ))}
            </div>
          )}

          {!showFeatured && !shown.length && (
            <div className="card card-outline class-empty">
              <Icon name="search_off" />
              <p>Không tìm thấy nhóm phù hợp.</p>
              {filtered && (
                <button
                  type="button"
                  className="btn btn-tertiary"
                  onClick={() => {
                    setScope('');
                    setQuery('');
                  }}
                >
                  Xoá bộ lọc
                </button>
              )}
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

// The main group: big card with my role, member count and the class's teams as sub-channels.
function FeaturedGroup({ item, activeRole, canCreate, onCreate }) {
  const { group, cls } = item;
  const teams = cls.teams;
  return (
    <section className="card card-outline my-featured" aria-labelledby="featured-title">
      <header className="my-featured-head">
        <span className="my-card-icon type-general" aria-hidden="true">
          <Icon name={GROUP_TYPE_ICONS.GENERAL} />
        </span>
        <div className="my-featured-main">
          <p className="my-featured-badges">
            <span className="stamp-solid">{cls.isHomeroom ? 'Nhóm chủ nhiệm' : 'Lớp của tôi'}</span>
            <span className="chip ink">Khối {cls.gradeLevel}</span>
          </p>
          <h2 id="featured-title" className="title-md">
            {titleOf(item)}
          </h2>
          <p className="my-card-role">
            Vai trò của tôi: <strong>{roleText(activeRole, cls)}</strong> · {group.memberCount} thành viên
            {!cls.isHomeroom && cls.homeroomName && <> · GVCN {cls.homeroomName}</>}
          </p>
        </div>
      </header>
      <p className="my-featured-desc">{GROUP_TYPE_DESC.GENERAL}</p>

      {(teams.length > 0 || canCreate) && (
        <div className="my-featured-teams">
          <p className="label-upper">
            {teams.length ? `${teams.length} team của lớp` : 'Team của lớp'}
          </p>
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
            {canCreate && (
              <button type="button" className="my-subchannel is-new" onClick={onCreate}>
                <Icon name="add" size="sm" className="my-subchannel-icon" />
                <span className="my-subchannel-text">
                  <span className="my-subchannel-name">Tạo team mới</span>
                  <span className="caption muted">Trò chuyện riêng theo tổ hoặc nhiệm vụ</span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      <footer className="my-featured-foot">
        <Link to={`/groups/${group.groupId}`} className="btn btn-secondary my-open-main">
          Mở nhóm
          <Icon name="arrow_forward" size="sm" />
        </Link>
      </footer>
    </section>
  );
}

// Any other group or team.
function GroupCard({ item, activeRole }) {
  const { group, cls } = item;
  const type = group.groupType;
  const badge = badgeOf(item, activeRole);
  const team = type === 'TEAM_CHAT';
  return (
    <article className="card card-outline my-card">
      <header className="my-card-head">
        <span className={`my-card-icon type-${type.toLowerCase()}`} aria-hidden="true">
          <Icon name={GROUP_TYPE_ICONS[type]} />
        </span>
        <span className={`my-badge ${badge.tone}`}>{badge.text}</span>
      </header>
      <h3 className="title-sm my-card-title">{titleOf(item)}</h3>
      <p className="my-card-role">
        {team && group.createdByName ? (
          <>
            Do <strong>{group.createdByName}</strong> tạo
          </>
        ) : (
          <>
            Vai trò: <strong>{roleText(activeRole, cls)}</strong>
          </>
        )}
      </p>
      <p className="my-card-desc">{GROUP_TYPE_DESC[type]}</p>
      <footer className="my-card-foot">
        <span className="caption muted">{group.memberCount} thành viên</span>
        <Link to={`/groups/${group.groupId}`} className="btn btn-secondary my-open">
          Mở nhóm
          <Icon name="chevron_right" size="sm" />
        </Link>
      </footer>
    </article>
  );
}
