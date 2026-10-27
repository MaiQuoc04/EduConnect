import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { MEMBER_KIND_LABELS } from './groupLabels.js';
import { memberSubline } from './memberText.js';

const TEACHER_KINDS = ['HOMEROOM', 'SUBJECT_TEACHER'];
const ROLE_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'TEACHER', label: 'Giáo viên', match: (p) => p.kinds.some((k) => TEACHER_KINDS.includes(k)) },
  { value: 'STUDENT', label: 'Học sinh', match: (p) => p.kinds.includes('STUDENT') },
  { value: 'PARENT', label: 'Phụ huynh', match: (p) => p.kinds.includes('PARENT') },
];
const plain = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

// SCR-23 "Tạo team" – UC-35 Create Team Chat: a chat-only team with people of one class. The creator is always a
// member; at least two others; locked accounts cannot be picked. The server checks everything again.
export default function TeamCreatePanel({ classId, onCancel, onCreated }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [selectedClass, setSelectedClass] = useState(classId ? String(classId) : '');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [picked, setPicked] = useState([]); // people
  const [error, setError] = useState(null); // { field: 'name' | null, text }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get('/groups/teams/options')
      .then(({ data }) => {
        if (!alive) return;
        setState({ loading: false, data, error: '' });
        setSelectedClass((c) => c || (data.classes[0] ? String(data.classes[0].classId) : ''));
      })
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, []);

  const limits = state.data?.limits;
  const current = state.data?.classes.find((c) => String(c.classId) === selectedClass) ?? null;
  const shown = useMemo(() => {
    if (!current) return [];
    const tab = ROLE_TABS.find((t) => t.value === role);
    const q = plain(query.trim());
    return current.people.filter(
      (p) => (!tab?.match || tab.match(p)) && (!q || plain(`${p.fullName} ${p.studentCode ?? ''}`).includes(q)),
    );
  }, [current, role, query]);
  const pickedIds = new Set(picked.map((p) => p.userId));
  const toggle = (p) => {
    setPicked((list) => (pickedIds.has(p.userId) ? list.filter((x) => x.userId !== p.userId) : [...list, p]));
    if (error && !error.field) setError(null);
  };

  function changeClass(value) {
    setSelectedClass(value);
    setPicked([]); // people belong to one class
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const teamName = name.trim();
    if (!teamName) {
      setError({ field: 'name', text: errorText({ code: 'MSG_TEAM_NAME_REQUIRED' }) });
      return;
    }
    if (teamName.length < limits.nameMin || teamName.length > limits.nameMax) {
      setError({ field: 'name', text: errorText({ code: 'MSG_TEAM_NAME_LENGTH', details: { min: limits.nameMin, max: limits.nameMax } }) });
      return;
    }
    if (picked.length < limits.minOthers) {
      setError({ field: null, text: errorText({ code: 'MSG_TEAM_TOO_FEW', details: { min: limits.minOthers } }) });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post('/groups/teams', {
        classId: Number(selectedClass),
        teamName,
        memberIds: picked.map((p) => p.userId),
      });
      toast(`Đã tạo team ${data.groupName} với ${data.memberCount} thành viên.`);
      onCreated(data.groupId);
    } catch (err) {
      setError({ field: err.code?.startsWith('MSG_TEAM_NAME') ? 'name' : null, text: errorText(err) });
      setSaving(false);
    }
  }

  return (
    <form className="card card-outline class-panel team-panel" onSubmit={handleSubmit} noValidate>
      <div className="class-panel-head">
        <div>
          <p className="label-upper muted">Tạo team</p>
          <h2 className="title-md">{current ? `Team thảo luận mới – Lớp ${current.className}` : 'Team thảo luận mới'}</h2>
        </div>
        <button type="button" className="btn btn-tertiary" onClick={onCancel} aria-label="Đóng">
          <Icon name="close" size="sm" />
        </button>
      </div>

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading ? (
        <p className="loading">Đang tải…</p>
      ) : !state.data.classes.length ? (
        <div className="notice">
          <Icon name="info" />
          <p>Bạn chưa thuộc lớp nào của năm học đang diễn ra nên chưa tạo được team.</p>
        </div>
      ) : (
        <>
          <div className={`team-form-grid${state.data.classes.length > 1 ? '' : ' one'}`}>
            {state.data.classes.length > 1 && (
              <div className="field">
                <label className="field-label" htmlFor="team-class">
                  Lớp
                </label>
                <select id="team-class" className="input" value={selectedClass} onChange={(e) => changeClass(e.target.value)}>
                  {state.data.classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      Lớp {c.className}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={`field${error?.field === 'name' ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="team-name">
                Tên team
              </label>
              <div className="input-wrap">
                <input
                  id="team-name"
                  className="input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error?.field === 'name') setError(null);
                  }}
                  placeholder="Tổ 1 – Toán Tin"
                  maxLength={limits.nameMax + 10}
                  autoFocus
                />
              </div>
              {error?.field === 'name' ? (
                <span className="field-error">{error.text}</span>
              ) : (
                <span className="field-help">Đặt tên ngắn gọn, thể hiện môn học hoặc nhiệm vụ của team.</span>
              )}
            </div>
          </div>

          <div className="field">
            <span className="field-label">
              Thành viên{' '}
              <span className="caption muted">
                Bạn và {picked.length} người đã chọn · cần ít nhất {limits.minOthers} người khác
              </span>
            </span>
            <span className="chips">
              <span className="chip ink">Bạn</span>
              {picked.map((p) => (
                <span key={p.userId} className="chip class-chip">
                  {p.fullName}
                  <button type="button" className="chip-remove" onClick={() => toggle(p)} aria-label={`Bỏ ${p.fullName}`}>
                    <Icon name="close" size="sm" />
                  </button>
                </span>
              ))}
            </span>
            <div className="team-filter">
              <div className="input-wrap subject-search">
                <Icon name="search" size="sm" className="subject-search-icon" />
                <input
                  className="input"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên…"
                  aria-label="Tìm người trong lớp"
                />
              </div>
              <div className="tabs" role="tablist" aria-label="Lọc theo vai trò">
                {ROLE_TABS.map((t) => (
                  <button key={t.value} type="button" role="tab" aria-selected={role === t.value} onClick={() => setRole(t.value)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="class-pick">
              {shown.length === 0 ? (
                <p className="muted caption">Không có người phù hợp.</p>
              ) : (
                <ul>
                  {shown.map((p) => {
                    const locked = p.status === 'LOCKED';
                    return (
                      <li key={p.userId}>
                        <label className={locked ? 'is-disabled' : ''}>
                          <input
                            type="checkbox"
                            checked={pickedIds.has(p.userId)}
                            onChange={() => toggle(p)}
                            disabled={locked || (!pickedIds.has(p.userId) && picked.length + 1 >= limits.maxMembers)}
                          />
                          <Avatar src={p.avatarUrl} name={p.fullName} size={28} />
                          <span>
                            <span className="subject-name">{p.fullName}</span>
                            {p.studentCode && <span className="mono caption muted"> · {p.studentCode}</span>}
                            {memberSubline(p) && <span className="caption muted group-member-sub">{memberSubline(p)}</span>}
                          </span>
                          <span className="chips">
                            {p.kinds.map((k) => (
                              <span key={k} className="chip">
                                {MEMBER_KIND_LABELS[k]}
                              </span>
                            ))}
                          </span>
                          {locked && <span className="pill red">Đã khoá</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="notice ink">
            <Icon name="info" />
            <p>Team chỉ dùng để trò chuyện giữa các thành viên được chọn trong lớp, không có bảng tin riêng.</p>
          </div>
        </>
      )}

      {error && !error.field && (
        <p className="form-error" role="alert">
          {error.text}
        </p>
      )}
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !current}>
          <Icon name="add" size="sm" />
          {saving ? 'Đang tạo…' : 'Tạo team'}
        </button>
      </div>
    </form>
  );
}
