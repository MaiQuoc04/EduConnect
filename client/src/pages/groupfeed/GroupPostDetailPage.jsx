import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { feedPath } from './groupFeedShared.jsx';
import PostDetail from './PostDetail.jsx';

// SCR-37 Group Post Detail as a page (/groups/:id/feed/:postId) – for old links and notifications. From the feed a post
// opens in a pop-up instead (GroupFeedPage → PostDialog, 14/11/2026); both show the same PostDetail.
export default function GroupPostDetailPage() {
  const g = useOutletContext();
  const { postId } = useParams();
  const navigate = useNavigate();
  const back = feedPath(g.groupId);
  return (
    <div className="feed-article-page gf-detail">
      <PostDetail
        key={postId}
        g={g}
        postId={postId}
        leading={
          <Link to={back} className="back-link">
            <Icon name="arrow_back" size="sm" />
            Bảng tin nhóm
          </Link>
        }
        editState={{ from: 'detail' }}
        onDeleted={() => navigate(back, { replace: true })}
      />
    </div>
  );
}
