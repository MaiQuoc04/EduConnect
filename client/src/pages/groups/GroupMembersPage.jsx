import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import AddMembersPanel from './AddMembersPanel.jsx';
import { MEMBER_KIND_LABELS } from './groupLabels.js';
import { memberSubline } from './memberText.js';
import RemoveMemberDialog from './RemoveMemberDialog.jsx';

const TEACHER_KINDS = ['HOMEROOM', 'SUBJECT_TEACHER', 'TEACHER', 'MANAGER'];
const NICKNAME_MAX = 50;
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

// SCR-24 Group Member List – UC-31 View Group Members, with UC-32 Add Group Member, UC-33 Remove Group Member and
// UC-34 Set Student Nickname for those allowed (the server checks again). Contacts and student codes only reach
// teachers and the School Manager.
export default function GroupMembersPage() {
  const group = useOutletContext();
  const { activeRole } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [version, setVersion] = useState(0);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null); // member
  const [editing, setEditing] = useState(null); // { userId, value, saving, error }

  useEffect(() => {
    let alive = true;
    api
      .get(`/groups/${group.groupId}/members`)
      .then(({ data }) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [group.groupId, version]);

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

  // After a change: refresh this list and the counts in the group header.
  function changed() {
    setAdding(false);
    setRemoving(null);
    setEditing(null);
    setVersion((v) => v + 1);
    group.reload();
  }

  async function saveNickname(e) {
    e.preventDefault();
    if (editing.value.trim().length > NICKNAME_MAX) {
      setEditing((x) => ({ ...x, error: errorText({ code: 'MSG_NICKNAME_TOO_LONG', details: { max: NICKNAME_MAX } }) }));
      return;
    }
    setEditing((x) => ({ ...x, saving: true, error: '' }));
    try {
      const { data: saved } = await api.put(`/groups/${group.groupId}/members/${editing.userId}/nickname`, {
        nickname: editing.value,
      });
      toast(saved.nickname ? `Đã đặt biệt danh “${saved.nickname}”.` : 'Đã xoá biệt danh.');
      changed();
    } catch (err) {
      setEditing((x) => ({ ...x, saving: false, error: errorText(err) }));
    }
  }

  if (state.error) return <p className="form-error">{state.error}</p>;
  if (state.loading) return <p className="loading">Đang tải thành viên…</p>;

  const { counts, showContacts, canManageMembers, canSetNickname } = data;
  const isClass = Boolean(group.class);
  const manager = activeRole === 'SCHOOL_MANAGER';
  // UC-33: never the homeroom teacher; teachers only by the School Manager (the server checks the same).
  const canRemove = (m) =>
    canManageMembers &&
    !m.kinds.includes('HOMEROOM') &&
    (manager || !m.kinds.some((k) => k === 'SUBJECT_TEACHER' || k === 'TEACHER'));
  const canName = (m) => canSetNickname && m.kinds.includes('STUDENT');
  const showActions = canManageMembers || canSetNickname;
  // SCR-24 stat tiles: one bordered card per figure, the label coloured by role.
  const stats = isClass
    ? [
        ['Tổng số thành viên', counts.total, ''],
        ['Học sinh', counts.students, 'blue'],
        ['Phụ huynh', counts.parents, ''],
        ['Giáo viên', counts.teachers, 'ink'],
      ]
    : [
        ['Tổng số thành viên', counts.total, ''],
        ['Giáo viên và quản lý', counts.teachers, 'ink'],
      ];
  const toolbarClass = `card card-outline group-toolbar${isClass ? '' : ' no-role'}${canManageMembers ? ' with-action' : ''}`;

  return (
    <div className="group-members">
      <dl className={`group-stats${isClass ? '' : ' two'}`}>
        {stats.map(([label, value, tone]) => (
          <div key={label} className={`group-stat${tone ? ` ${tone}` : ''}`}>
            <dt className="label-upper">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {adding && <AddMembersPanel group={group} onCancel={() => setAdding(false)} onDone={changed} />}

      <div className={toolbarClass}>
        <div className="input-wrap subject-search">
          <Icon name="search" size="sm" className="subject-search-icon" />
          <input
            className="input"
            type="search"
            placeholder={
              !isClass
                ? 'Tìm theo tên…'
                : showContacts
                  ? 'Tìm theo tên, biệt danh hoặc mã…'
                  : 'Tìm theo tên hoặc biệt danh…'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm thành viên"
          />
        </div>
        {isClass && (
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Vai trò">
            {ROLE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        )}
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái">
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="LOCKED">Đã khoá</option>
        </select>
        {canManageMembers && (
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} disabled={adding}>
            <Icon name="person_add" size="sm" />
            Thêm thành viên
          </button>
        )}
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
                {showActions && <th className="num">Thao tác</th>}
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
                        {memberSubline(m) && <span className="caption muted group-member-sub">{memberSubline(m)}</span>}
                      </span>
                    </span>
                  </td>
                  {isClass && (
                    <td>
                      {editing?.userId === m.userId ? (
                        <form className="group-nickname" onSubmit={saveNickname}>
                          <span className="group-nickname-row">
                          <input
                            className="input"
                            value={editing.value}
                            onChange={(e) => setEditing((x) => ({ ...x, value: e.target.value, error: '' }))}
                            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                            maxLength={NICKNAME_MAX + 10}
                            placeholder="Để trống để xoá"
                            aria-label={`Biệt danh của ${m.fullName}`}
                            autoFocus
                          />
                          <button type="submit" className="btn btn-tertiary" disabled={editing.saving} aria-label="Lưu biệt danh">
                            <Icon name="check" size="sm" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-tertiary"
                            onClick={() => setEditing(null)}
                            disabled={editing.saving}
                            aria-label="Huỷ"
                          >
                            <Icon name="close" size="sm" />
                          </button>
                          </span>
                          {editing.error && <span className="field-error">{editing.error}</span>}
                        </form>
                      ) : (
                        <span className={m.nickname ? '' : 'muted'}>{m.nickname ?? '—'}</span>
                      )}
                    </td>
                  )}
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
                  {showActions && (
                    <td className="num">
                      <span className="group-row-actions">
                        {canName(m) && editing?.userId !== m.userId && (
                          <button
                            type="button"
                            className="btn btn-tertiary"
                            onClick={() => setEditing({ userId: m.userId, value: m.nickname ?? '', saving: false, error: '' })}
                            title="Đặt biệt danh"
                            aria-label={`Đặt biệt danh cho ${m.fullName}`}
                          >
                            <Icon name="badge" size="sm" />
                          </button>
                        )}
                        {canRemove(m) && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => setRemoving(m)}
                            title="Xoá khỏi nhóm"
                            aria-label={`Xoá ${m.fullName} khỏi nhóm`}
                          >
                            <Icon name="person_remove" size="sm" />
                          </button>
                        )}
                      </span>
                    </td>
                  )}
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
          {canSetNickname && ' · Biệt danh hiện trong cả ba nhóm của lớp'}
        </p>
      </div>

      {removing && (
        <RemoveMemberDialog group={group} member={removing} onCancel={() => setRemoving(null)} onDone={changed} />
      )}
    </div>
  );
}
