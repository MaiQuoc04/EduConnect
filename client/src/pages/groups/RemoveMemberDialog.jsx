import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';

// SCR-24 – UC-33 Remove Group Member: confirmation before setting left_at. Uses the native <dialog> (focus stays
// inside, Esc closes).
export default function RemoveMemberDialog({ group, member, onCancel, onDone }) {
  const toast = useToast();
  const ref = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function handleRemove() {
    setSaving(true);
    setError('');
    try {
      await api.delete(`/groups/${group.groupId}/members/${member.userId}`);
      toast(`Đã xoá ${member.fullName} khỏi ${group.groupName}.`);
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="group-dialog" onCancel={onCancel} aria-labelledby="remove-title">
      <h2 id="remove-title" className="title-md">
        Xoá {member.fullName} khỏi nhóm?
      </h2>
      <p>
        {member.fullName} sẽ không xem được bảng tin và tin nhắn của {group.groupName} nữa. Lịch sử trò chuyện vẫn được
        giữ lại, và có thể thêm lại người này sau.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="button" className="btn btn-secondary btn-danger" onClick={handleRemove} disabled={saving}>
          <Icon name="person_remove" size="sm" />
          {saving ? 'Đang xoá…' : 'Xoá khỏi nhóm'}
        </button>
      </div>
    </dialog>
  );
}
