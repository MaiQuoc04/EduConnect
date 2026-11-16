import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import { fold } from '../subjects/subjectText.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import { MEMBER_KIND_LABELS } from './groupLabels.js';

// Team actions (FE-04 teams, business-rules §4, lead OK 15/11/2026), shared by SCR-21 Group Detail and the chat header:
//   Đổi tên nhóm           any member                         PATCH /groups/:id { groupName }
//   Chuyển quyền trưởng nhóm  the leader                      PUT /groups/:id/leader { userId }
//   Thêm / xoá thành viên  the leader (17/11/2026)            opens SCR-22, where the leader adds and removes members
//   Rời nhóm               any member; the leader while others remain first picks the new leader
//                          (POST /groups/:id/leave { newLeaderId }); the last member closes the team.
// g = GET /groups/:id (groupId, groupName, counts, isLeader, canRename, canTransfer, canLeave).
// useTeamActions(g, { onLeft(result), onChanged() }) → { items: [{ key, label, icon, danger, run }], dialogs }.

const NAME_MIN = 2;
const NAME_MAX = 100;

export function useTeamActions(g, { onLeft, onChanged }) {
  const [open, setOpen] = useState(null); // 'rename' | 'transfer' | 'leave-pick' | 'leave'
  const navigate = useNavigate();
  const team = g?.groupType === 'TEAM_CHAT';
  const others = (g?.counts?.total ?? 1) - 1;

  const items = team
    ? [
        g.canRename && { key: 'rename', label: 'Đổi tên nhóm', icon: 'edit', run: () => setOpen('rename') },
        g.canAddMembers && {
          key: 'members',
          label: 'Thêm / xoá thành viên',
          icon: 'group_add',
          run: () => navigate(`/groups/${g.groupId}/members`),
        },
        g.canTransfer && others > 0 && {
          key: 'transfer',
          label: 'Chuyển quyền trưởng nhóm',
          icon: 'swap_horiz',
          run: () => setOpen('transfer'),
        },
        g.canLeave && {
          key: 'leave',
          label: 'Rời nhóm',
          icon: 'logout',
          danger: true,
          run: () => setOpen(g.isLeader && others > 0 ? 'leave-pick' : 'leave'),
        },
      ].filter(Boolean)
    : [];

  async function leave(newLeaderId) {
    const { data } = await api.post(`/groups/${g.groupId}/leave`, newLeaderId ? { newLeaderId } : {});
    setOpen(null);
    onLeft?.(data);
  }

  const close = () => setOpen(null);
  const dialogs = !team ? null : (
    <>
      {open === 'rename' && (
        <RenameDialog
          g={g}
          onCancel={close}
          onDone={() => {
            close();
            onChanged?.();
          }}
        />
      )}
      {open === 'transfer' && (
        <PickLeaderDialog
          g={g}
          title="Chuyển quyền trưởng nhóm"
          note="Bạn vẫn ở lại nhóm như một thành viên."
          confirmLabel="Chuyển quyền"
          onCancel={close}
          onConfirm={async (userId) => {
            await api.put(`/groups/${g.groupId}/leader`, { userId });
            close();
            onChanged?.();
          }}
        />
      )}
      {open === 'leave-pick' && (
        <PickLeaderDialog
          g={g}
          title={`Rời ${g.groupName}?`}
          note="Bạn là trưởng nhóm. Hãy chọn người làm trưởng nhóm mới; bạn sẽ rời nhóm ngay sau khi chuyển quyền."
          confirmLabel="Chuyển quyền và rời nhóm"
          danger
          onCancel={close}
          onConfirm={leave}
        />
      )}
      {open === 'leave' && (
        <ConfirmDialog
          title={`Rời ${g.groupName}?`}
          confirmLabel="Rời nhóm"
          busyLabel="Đang rời…"
          icon="logout"
          onConfirm={() => leave(null)}
          onCancel={close}
        >
          {others <= 0
            ? 'Bạn là thành viên cuối cùng. Rời đi thì nhóm sẽ đóng và không ai xem được nữa.'
            : 'Bạn sẽ không xem được tin nhắn của nhóm nữa và không thể tự quay lại. Các thành viên khác vẫn ở lại nhóm.'}
        </ConfirmDialog>
      )}
    </>
  );
  return { items, dialogs };
}

/** The team's actions as a "⋮" menu (chat header). */
export function TeamMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div className="team-menu" ref={ref}>
      <button
        type="button"
        className="btn btn-icon"
        aria-label="Thao tác với nhóm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <div className="team-menu-list" role="menu" id={menuId}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`team-menu-item${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              <Icon name={item.icon} size="sm" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RenameDialog({ g, onCancel, onDone }) {
  const ref = useRef(null);
  const [name, setName] = useState(g.groupName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fieldId = useId();
  useEffect(() => ref.current?.showModal(), []);
  const clean = name.trim().replace(/\s+/g, ' ');
  const invalid = clean.length < NAME_MIN || clean.length > NAME_MAX;

  async function save(e) {
    e.preventDefault();
    if (invalid || saving) return;
    if (clean === g.groupName) {
      onCancel();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/groups/${g.groupId}`, { groupName: clean });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="group-dialog" onCancel={onCancel} aria-labelledby={`${fieldId}-title`}>
      <form onSubmit={save} noValidate>
        <h2 id={`${fieldId}-title`} className="title-md">
          Đổi tên nhóm
        </h2>
        <div className={`field${error || (name && invalid) ? ' invalid' : ''}`}>
          <label htmlFor={fieldId} className="field-label">
            Tên nhóm
          </label>
          <input
            id={fieldId}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX + 20}
            autoFocus
            disabled={saving}
          />
          <span className={name && invalid ? 'field-error' : 'field-help'}>
            Tên nhóm gồm {NAME_MIN}–{NAME_MAX} ký tự. Mọi thành viên sẽ thấy thông báo đổi tên trong cuộc trò chuyện.
          </span>
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <div className="card-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || invalid}>
            <Icon name="check" size="sm" />
            {saving ? 'Đang lưu…' : 'Lưu tên'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// Choose the new team leader among the other members (locked accounts allowed, with a warning: business-rules §4, Q4).
function PickLeaderDialog({ g, title, note, confirmLabel, danger, onCancel, onConfirm }) {
  const ref = useRef(null);
  const { user } = useAuth();
  const [members, setMembers] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();

  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => {
    let alive = true;
    api
      .get(`/groups/${g.groupId}/members`)
      .then(({ data }) => alive && setMembers((data.members ?? data).filter((m) => m.userId !== user?.id)))
      .catch((err) => alive && setLoadError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [g.groupId, user?.id]);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return (members ?? []).filter((m) => !q || fold(m.fullName).includes(q));
  }, [members, query]);
  const pick = members?.find((m) => m.userId === chosen);

  async function confirm() {
    if (!chosen || saving) return;
    setSaving(true);
    setError('');
    try {
      await onConfirm(chosen);
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
      if (err.code === 'MSG_TEAM_LEADER_INVALID') {
        setChosen(null);
        api.get(`/groups/${g.groupId}/members`).then(({ data }) => setMembers((data.members ?? data).filter((m) => m.userId !== user?.id)));
      }
    }
  }

  return (
    <dialog ref={ref} className="sf-dialog team-pick-dialog" onCancel={(e) => { e.preventDefault(); if (!saving) onCancel(); }} aria-labelledby={titleId}>
      <div className={`sf-dialog-head${danger ? ' is-danger' : ''}`}>
        <Icon name={danger ? 'logout' : 'swap_horiz'} />
        <h2 id={titleId} className="title-sm">
          {title}
        </h2>
      </div>
      <p className="caption muted">{note}</p>
      <div className="input-wrap team-pick-search">
        <Icon name="search" size="sm" />
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm thành viên…"
          aria-label="Tìm thành viên"
        />
      </div>
      {loadError ? (
        <p className="form-error">{loadError}</p>
      ) : !members ? (
        <p className="loading">Đang tải thành viên…</p>
      ) : (
        <ul className="team-pick-list" role="radiogroup" aria-label="Trưởng nhóm mới">
          {shown.map((m) => (
            <li key={m.userId}>
              <label className={`team-pick-item${chosen === m.userId ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name={`${titleId}-leader`}
                  checked={chosen === m.userId}
                  onChange={() => setChosen(m.userId)}
                />
                <Avatar src={m.avatarUrl} name={m.fullName} size={32} />
                <span className="team-pick-text">
                  <span className="team-pick-name">
                    {m.fullName}
                    {m.status === 'LOCKED' && <span className="pill red">Đã khoá</span>}
                  </span>
                  <span className="caption muted">{(m.kinds ?? []).map((k) => MEMBER_KIND_LABELS[k]).join(', ')}</span>
                </span>
              </label>
            </li>
          ))}
          {!shown.length && <li className="caption muted team-pick-empty">Không có thành viên phù hợp.</li>}
        </ul>
      )}
      {pick?.status === 'LOCKED' && (
        <div className="notice amber">
          <Icon name="warning" size="sm" />
          <p>Tài khoản này đang bị khoá nên chưa đăng nhập được. Bạn vẫn có thể chọn nếu không còn ai khác.</p>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving} autoFocus>
          Huỷ
        </button>
        <button
          type="button"
          className={`btn btn-primary${danger ? ' sf-btn-danger' : ''}`}
          onClick={confirm}
          disabled={!chosen || saving}
        >
          <Icon name={saving ? 'progress_activity' : danger ? 'logout' : 'swap_horiz'} size="sm" className={saving ? 'sf-spin' : undefined} />
          {saving ? 'Đang lưu…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
