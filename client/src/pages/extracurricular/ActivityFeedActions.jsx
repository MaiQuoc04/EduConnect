import { Link } from 'react-router-dom';
import { FeedPanel } from '../../components/feed/Feed.jsx';
import Icon from '../../components/Icon.jsx';
import './extracurricular.css';

// FE-07 entry in the right column of the FE-05 class feed: the homeroom teacher (moderator of the class's GENERAL
// group) creates an activity for this class straight from the feed. The server still checks homeroom / year / feed
// (UC-50). Hidden for everyone else and once the school year has ended.
export default function ActivityFeedActions({ group, info }) {
  if (group?.groupType !== 'GENERAL' || !group.class || group.readOnly || !info?.isModerator) return null;
  const classId = group.class.classId;
  return (
    <FeedPanel icon="hiking" title="Hoạt động ngoại khoá" titleId="xa-feed-panel-title">
      <p className="caption muted xa-feed-panel-text">Đăng hoạt động cho lớp {group.class.className}: phụ huynh đăng ký cho con ngay trên bảng tin.</p>
      <div className="xa-feed-panel-actions">
        <Link to={`/extracurricular/new?classId=${classId}&from=feed`} className="btn btn-primary btn-sm"><Icon name="add" size="sm" /> Tạo hoạt động</Link>
        <Link to={`/extracurricular?classId=${classId}`} className="btn btn-secondary btn-sm">Xem các hoạt động</Link>
      </div>
    </FeedPanel>
  );
}
