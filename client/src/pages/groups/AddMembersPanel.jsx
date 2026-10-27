import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import { MEMBER_KIND_LABELS } from './groupLabels.js';
import { memberSubline } from './memberText.js';

// SCR-24 – UC-32 Add Group Member: people of the same class who belong in this group but are not in it now (never
// added, or removed earlier). Nobody from outside the class can be added here.
export default function AddMembersPanel({ group, onCancel, onDone }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, candidates: [], error: '' });
  const [picked, setPicked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .get(`/groups/${group.groupId}/candidates`)
      .then(({ data }) => alive && setState({ loading: false, candidates: data.candidates, error: '' }))
      .catch((err) => alive && setState({ loading: false, candidates: [], error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [group.groupId]);

  const all = useMemo(() => state.candidates.map((c) => c.userId), [state.candidates]);
  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
      ) : state.candidates.length === 0 ? (
        <div className="notice">
          <Icon name="info" />
          <p>Mọi người thuộc lớp {group.class?.className} đã có trong nhóm này.</p>
        </div>
      ) : (
        <>
          <div className="group-pick-head caption muted">
            <span>Chỉ có học sinh, phụ huynh và giáo viên của lớp {group.class?.className} phù hợp với nhóm này.</span>
            <button
              type="button"
              className="btn btn-tertiary"
              onClick={() => setPicked(picked.size === all.length ? new Set() : new Set(all))}
            >
              {picked.size === all.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>
          <div className="class-pick">
            <ul>
              {state.candidates.map((c) => (
                <li key={c.userId}>
                  <label>
                    <input type="checkbox" checked={picked.has(c.userId)} onChange={() => toggle(c.userId)} />
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
