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
const SCHOOL = 'school'; // the "Giáo viên toàn trường" choice: a teacher team, with no class
const plain = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

// SCR-21 "Tạo team" – UC-35 Create Team Chat: a chat-only team with people of one class. The creator is always a
// member; at least two others; locked accounts cannot be picked. The server checks everything again. A teacher can
// also choose "Giáo viên toàn trường": a teacher team with teachers of the school, filtered by department.
// school: start on that choice.
export default function TeamCreatePanel({ classId, school = false, onCancel, onCreated }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [selectedClass, setSelectedClass] = useState(school ? SCHOOL : classId ? String(classId) : '');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
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
        setSelectedClass((c) => c || (data.classes[0] ? String(data.classes[0].classId) : data.teacherGroup ? SCHOOL : ''));
      })
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, []);

  const limits = state.data?.limits;
  const teacherGroup = state.data?.teacherGroup ?? null;
  const isSchool = selectedClass === SCHOOL && Boolean(teacherGroup);
  const current = isSchool
    ? { people: teacherGroup.people }
    : (state.data?.classes.find((c) => String(c.classId) === selectedClass) ?? null);
  const sourceCount = (state.data?.classes.length ?? 0) + (teacherGroup ? 1 : 0);
  const departments = useMemo(
    () =>
      [...new Set((teacherGroup?.people ?? []).map((p) => p.department).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'vi'),
      ),
    [teacherGroup],
  );
  const shown = useMemo(() => {
    if (!current) return [];
    const tab = isSchool ? null : ROLE_TABS.find((t) => t.value === role);
    const q = plain(query.trim());
    return current.people.filter(
      (p) =>
        (!tab?.match || tab.match(p)) &&
        (!isSchool || !department || p.department === department) &&
        (!q || plain(`${p.fullName} ${p.studentCode ?? ''} ${p.department ?? ''}`).includes(q)),
    );
  }, [current, isSchool, role, department, query]);
  const pickedIds = new Set(picked.map((p) => p.userId));
  const toggle = (p) => {
    setPicked((list) => (pickedIds.has(p.userId) ? list.filter((x) => x.userId !== p.userId) : [...list, p]));
    if (error && !error.field) setError(null);
  };

  function changeClass(value) {
    setSelectedClass(value);
    setPicked([]); // people belong to one class
    setRole('');
    setDepartment('');
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
      const memberIds = picked.map((p) => p.userId);
      const { data } = await api.post(
        '/groups/teams',
        isSchool
          ? { source: 'TEACHER_SCHOOL', teamName, memberIds }
          : { classId: Number(selectedClass), teamName, memberIds },
      );
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
          <h2 className="title-md">
            {isSchool
              ? `Team thảo luận mới – ${teacherGroup.groupName}`
              : current
                ? `Team thảo luận mới – Lớp ${current.className}`
                : 'Team thảo luận mới'}
          </h2>
        </div>
        <button type="button" className="btn btn-tertiary" onClick={onCancel} aria-label="Đóng">
          <Icon name="close" size="sm" />
        </button>
      </div>

      {state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading ? (
        <p className="loading">Đang tải…</p>
      ) : !sourceCount ? (
        <div className="notice">
          <Icon name="info" />
          <p>Bạn chưa thuộc lớp nào của năm học đang diễn ra nên chưa tạo được team.</p>
        </div>
      ) : (
        <>
          <div className={`team-form-grid${sourceCount > 1 ? '' : ' one'}`}>
            {sourceCount > 1 && (
              <div className="field">
                <label className="field-label" htmlFor="team-class">
                  {teacherGroup ? 'Lớp hoặc nhóm' : 'Lớp'}
                </label>
                <select id="team-class" className="input" value={selectedClass} onChange={(e) => changeClass(e.target.value)}>
                  {state.data.classes.map((c) => (
                    <option key={c.classId} value={c.classId}>
                      Lớp {c.className}
                    </option>
                  ))}
                  {teacherGroup && <option value={SCHOOL}>{teacherGroup.groupName}</option>}
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
                  placeholder={isSchool ? 'Tổ Toán – Họp chuyên môn' : 'Tổ 1 – Toán Tin'}
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
                  aria-label={isSchool ? 'Tìm giáo viên' : 'Tìm người trong lớp'}
                />
              </div>
              {isSchool ? (
                departments.length > 0 && (
                  <select
                    className="input"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    aria-label="Lọc theo tổ chuyên môn"
                  >
                    <option value="">Tất cả tổ chuyên môn</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                )
              ) : (
                <div className="tabs" role="tablist" aria-label="Lọc theo vai trò">
                  {ROLE_TABS.map((t) => (
                    <button key={t.value} type="button" role="tab" aria-selected={role === t.value} onClick={() => setRole(t.value)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
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
                            {(memberSubline(p) || p.department) && (
                              <span className="caption muted group-member-sub">{memberSubline(p) || p.department}</span>
                            )}
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
            <p>
              {isSchool
                ? 'Team chỉ dùng để trò chuyện giữa các giáo viên được chọn, không có bảng tin riêng. Quản lý trường không xem được team này.'
                : 'Team chỉ dùng để trò chuyện giữa các thành viên được chọn trong lớp, không có bảng tin riêng.'}
            </p>
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
