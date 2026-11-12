import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import './extracurricular.css';

// FE-07 entry inside the FE-05 class feed: the homeroom teacher (moderator of the class's GENERAL group) creates an
// activity for this class straight from the feed. The server still checks homeroom / year / feed (UC-50).
export default function ActivityFeedActions({ group, info }) {
  if (group?.groupType !== 'GENERAL' || !group.class || group.readOnly || !info?.isModerator) return null;
  const classId = group.class.classId;
  return (
    <div className="xa-feed-actions">
      <p className="caption"><Icon name="hiking" size="sm" /> Hoạt động ngoại khoá của lớp {group.class.className}: phụ huynh đăng ký cho con ngay trên bảng tin.</p>
      <Link to={`/extracurricular/new?classId=${classId}&from=feed`} className="btn btn-primary"><Icon name="add" size="sm" /> Tạo hoạt động ngoại khoá</Link>
      <Link to={`/extracurricular?classId=${classId}`} className="btn btn-text">Xem các hoạt động</Link>
    </div>
  );
}
