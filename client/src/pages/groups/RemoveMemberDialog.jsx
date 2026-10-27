import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

// SCR-24 – UC-33 Remove Group Member: confirmation before setting left_at.
export default function RemoveMemberDialog({ group, member, onCancel, onDone }) {
  const toast = useToast();

  async function handleRemove() {
    await api.delete(`/groups/${group.groupId}/members/${member.userId}`);
    toast(`Đã xoá ${member.fullName} khỏi ${group.groupName}.`);
    onDone();
  }

  return (
    <ConfirmDialog
      title={`Xoá ${member.fullName} khỏi nhóm?`}
      confirmLabel="Xoá khỏi nhóm"
      busyLabel="Đang xoá…"
      icon="person_remove"
      onConfirm={handleRemove}
      onCancel={onCancel}
    >
      {member.fullName} sẽ không xem được bảng tin và tin nhắn của {group.groupName} nữa. Lịch sử trò chuyện vẫn được
      giữ lại, và có thể thêm lại người này sau.
    </ConfirmDialog>
  );
}
