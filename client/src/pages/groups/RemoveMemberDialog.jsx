import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

// SCR-22 – UC-33 Remove Group Member: confirmation before setting left_at. Since 17/11/2026 only the leader of a team
// removes members (business-rules §4); the chat shows "A đã xoá B khỏi nhóm".
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
      {member.fullName} sẽ không xem được tin nhắn của {group.groupName} nữa và nhóm sẽ biến mất khỏi danh sách của họ.
      Trong cuộc trò chuyện sẽ có dòng “Bạn đã xoá {member.fullName} khỏi nhóm”. Bạn có thể thêm lại người này sau.
    </ConfirmDialog>
  );
}
