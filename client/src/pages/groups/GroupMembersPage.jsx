import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { errorText, RELATIONSHIP_LABELS } from '../../messages.js';
import { MEMBER_KIND_LABELS } from './groupLabels.js';

const TEACHER_KINDS = ['HOMEROOM', 'SUBJECT_TEACHER', 'TEACHER', 'MANAGER'];
const ROLE_FILTERS = [
  { value: '', label: 'Tất cả vai trò' },
  { value: 'TEACHER', label: 'Giáo viên', match: (m) => m.kinds.some((k) => TEACHER_KINDS.includes(k)) },
  { value: 'STUDENT', label: 'Học sinh', match: (m) => m.kinds.includes('STUDENT') },
  { value: 'PARENT', label: 'Phụ huynh', match: (m) => m.kinds.includes('PARENT') },
];

// Names and codes are compared without accents or case: "tran" finds "Trần".
const plain = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

// SCR-24 Group Member List – UC-31 View Group Members. Everyone in the group sees names, roles and account status;
// contacts and student codes only reach teachers and the School Manager (the server leaves them out otherwise).
// Adding / removing members (UC-32, UC-33) and nicknames (UC-34) come next.
export default function GroupMembersPage() {
  const group = useOutletContext();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get(`/groups/${group.groupId}/members`)
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [group.groupId]);

  const data = state.data;
  const members = useMemo(() => data?.members ?? [], [data]);
  const shown = useMemo(() => {
    const filter = ROLE_FILTERS.find((f) => f.value === role);
    const q = plain(query.trim());
    return members.filter(
      (m) =>
        (!filter?.match || filter.match(m)) &&
        (!status || m.status === status) &&
        (!q || plain(`${m.fullName} ${m.nickname ?? ''} ${m.studentCode ?? ''}`).includes(q)),
    );
  }, [members, role, status, query]);

  if (state.error) return <p className="form-error">{state.error}</p>;
  if (state.loading) return <p className="loading">Đang tải thành viên…</p>;

  const { counts, showContacts } = data;
  const isClass = Boolean(group.class);
  const stats = isClass
    ? [
        ['Tổng số thành viên', counts.total],
        ['Giáo viên', counts.teachers],
        ['Học sinh', counts.students],
        ['Phụ huynh', counts.parents],
      ]
    : [
        ['Tổng số thành viên', counts.total],
        ['Giáo viên và quản lý', counts.teachers],
      ];

  return (
    <div className="group-members">
      <dl className={`import-stats group-stats${isClass ? '' : ' two'}`}>
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="card card-outline class-toolbar">
        <div className="input-wrap subject-search class-search">
          <Icon name="search" size="sm" className="subject-search-icon" />
          <input
            className="input"
            type="search"
            placeholder={showContacts ? 'Tìm theo tên, biệt danh hoặc mã…' : 'Tìm theo tên hoặc biệt danh…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm thành viên"
          />
        </div>
        {isClass && (
          <select className="input group-filter" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Vai trò">
            {ROLE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        )}
        <select className="input group-filter" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái">
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="LOCKED">Đã khoá</option>
        </select>
      </div>

      <div className="card card-outline class-table">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="num">STT</th>
                <th>Họ và tên</th>
                {isClass && <th>Biệt danh</th>}
                <th>Vai trò</th>
                {showContacts && <th>Liên hệ</th>}
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m, i) => (
                <tr key={m.userId}>
                  <td className="num muted">{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    <span className="group-member">
                      <Avatar src={m.avatarUrl} name={m.fullName} size={32} />
                      <span>
                        <span className="subject-name">{m.fullName}</span>
                        {m.studentCode && <span className="mono caption muted"> · {m.studentCode}</span>}
                        {m.children.length > 0 && (
                          <span className="caption muted group-member-sub">
                            {m.children.map((c) => `${RELATIONSHIP_LABELS[c.relationship] ?? 'Phụ huynh'} của ${c.fullName}`).join(', ')}
                          </span>
                        )}
                        {m.subjects.length > 0 && (
                          <span className="caption muted group-member-sub">{m.subjects.join(', ')}</span>
                        )}
                      </span>
                    </span>
                  </td>
                  {isClass && <td className={m.nickname ? '' : 'muted'}>{m.nickname ?? '—'}</td>}
                  <td>
                    <span className="chips">
                      {m.kinds.map((k) => (
                        <span key={k} className={`chip${k === 'HOMEROOM' || k === 'MANAGER' ? ' ink' : ''}`}>
                          {MEMBER_KIND_LABELS[k]}
                        </span>
                      ))}
                    </span>
                  </td>
                  {showContacts && (
                    <td className="caption">
                      {m.phone || m.email ? (
                        <span className="group-member-contact">
                          {m.phone && <span className="mono">{m.phone}</span>}
                          {m.email && <span className="muted">{m.email}</span>}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )}
                  <td>
                    {m.status === 'LOCKED' ? <span className="pill red">Đã khoá</span> : <span className="pill green">Hoạt động</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && (
          <p className="subject-empty muted">{members.length ? 'Không tìm thấy thành viên phù hợp.' : 'Nhóm chưa có thành viên.'}</p>
        )}
        <p className="subject-foot caption muted">
          Hiển thị {shown.length} / {members.length} thành viên · {group.groupName}
        </p>
      </div>
    </div>
  );
}
