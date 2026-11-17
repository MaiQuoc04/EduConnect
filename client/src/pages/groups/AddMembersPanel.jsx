import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import { MEMBER_KIND_LABELS } from './groupLabels.js';
import { memberSubline } from './memberText.js';

// SCR-22 – UC-32 Add Group Member: people of the same class who belong in this group but are not in it now (never
// added, or removed earlier). Nobody from outside the class can be added here. Class groups: the School Manager only.
// Teams (17/11/2026, business-rules §4): the leader, people of the team's class (a teacher team: teachers of the
// teacher group), active accounts only, up to the team's size limit (maxMembers from the server).
export default function AddMembersPanel({ group, onCancel, onDone }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, candidates: [], room: null, error: '' });
  const team = group.groupType === 'TEAM_CHAT';
  const [picked, setPicked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get(`/groups/${group.groupId}/candidates`)
      .then(
        ({ data }) =>
          alive &&
          setState({
            loading: false,
            candidates: data.candidates,
            // Teams: how many more people fit (null = no limit here).
            room: data.maxMembers ? Math.max(0, data.maxMembers - data.memberCount) : null,
            error: '',
          }),
      )
      .catch((err) => alive && setState({ loading: false, candidates: [], room: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [group.groupId]);

  // A team cannot take a locked account (it cannot sign in); class groups keep their former behaviour.
  const pickable = (c) => !team || c.status === 'ACTIVE';
  const all = useMemo(
    () => state.candidates.filter((c) => !team || c.status === 'ACTIVE').map((c) => c.userId),
    [state.candidates, team],
  );
  const full = state.room !== null && picked.size >= state.room;
  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (state.room === null || next.size < state.room) next.add(id);
      return next;
    });
  const selectAll = () => setPicked(new Set(state.room === null ? all : all.slice(0, state.room)));
  const allPicked = picked.size > 0 && picked.size === Math.min(all.length, state.room ?? all.length);
  const where = team && !group.class ? 'giáo viên của trường' : `người của lớp ${group.class?.className}`;

  async function handleAdd() {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/groups/${group.groupId}/members`, { userIds: [...picked] });
      toast(`Đã thêm ${data.added} thành viên vào ${group.groupName}.`);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <section className="card card-outline class-panel">
      <div className="class-panel-head">
        <div>
          <p className="label-upper muted">Thêm thành viên</p>
          <h2 className="title-md">{group.groupName}</h2>
        </div>
        <button type="button" className="btn btn-tertiary" onClick={onCancel} aria-label="Đóng">
          <Icon name="close" size="sm" />
        </button>
      </div>

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading ? (
        <p className="loading">Đang tải danh sách…</p>
      ) : state.room === 0 ? (
        <div className="notice">
          <Icon name="info" />
          <p>Team đã đủ số thành viên tối đa. Hãy xoá bớt thành viên trước khi thêm người mới.</p>
        </div>
      ) : state.candidates.length === 0 ? (
        <div className="notice">
          <Icon name="info" />
          <p>{team ? `Mọi ${where} đã có trong team này.` : `Mọi người thuộc lớp ${group.class?.className} đã có trong nhóm này.`}</p>
        </div>
      ) : (
        <>
          <div className="group-pick-head caption muted">
            <span>
              {team
                ? `Chỉ thêm được ${where}, tài khoản đang hoạt động. Còn ${state.room} chỗ trống.`
                : `Chỉ có học sinh, phụ huynh và giáo viên của lớp ${group.class?.className} phù hợp với nhóm này.`}
            </span>
            <button
              type="button"
              className="btn btn-tertiary"
              onClick={() => (allPicked ? setPicked(new Set()) : selectAll())}
              disabled={!all.length}
            >
              {allPicked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>
          <div className="class-pick">
            <ul>
              {state.candidates.map((c) => (
                <li key={c.userId}>
                  <label className={!pickable(c) || (full && !picked.has(c.userId)) ? 'is-disabled' : undefined}>
                    <input
                      type="checkbox"
                      checked={picked.has(c.userId)}
                      onChange={() => toggle(c.userId)}
                      disabled={!pickable(c) || (full && !picked.has(c.userId))}
                    />
                    <Avatar src={c.avatarUrl} name={c.fullName} size={28} />
                    <span>
                      <span className="subject-name">{c.fullName}</span>
                      {c.studentCode && <span className="mono caption muted"> · {c.studentCode}</span>}
                      {memberSubline(c) && <span className="caption muted group-member-sub">{memberSubline(c)}</span>}
                    </span>
                    <span className="chips">
                      {c.kinds.map((k) => (
                        <span key={k} className="chip">
                          {MEMBER_KIND_LABELS[k]}
                        </span>
                      ))}
                    </span>
                    {c.leftAt && <span className="caption muted">Đã rời nhóm ngày {formatDate(c.leftAt)}</span>}
                    {c.status === 'LOCKED' && <span className="pill red">Đã khoá</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={saving || picked.size === 0}>
          {saving ? 'Đang thêm…' : `Thêm${picked.size ? ` (${picked.size})` : ''}`}
        </button>
      </div>
    </section>
  );
}
