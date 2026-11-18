import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { POST_TYPE_LABELS } from './schoolFeedShared.jsx';
import SchoolPostDetail from './SchoolPostDetail.jsx';

// SCR-05 School Post Detail as a page (/school-feed/:schoolPostId, FE-08, owner Anh) – for links from notifications,
// the post forms and anywhere else. From the feed a post opens in a pop-up instead (SchoolFeedPage → FeedPostDialog,
// 18/11/2026, as FE-05); both show the same SchoolPostDetail. This page stays as it was, so the pop-up can be dropped
// again without losing anything (screens.md defines SCR-05 as a page; the pop-up waits for the lead).

const FEED_PATH = '/school-feed';

export default function SchoolPostDetailPage() {
  const { schoolPostId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Back to the feed with the same search / pages / tab it was opened from (same pattern as FE-02).
  const listSearch = location.state?.listSearch ?? '';
  const backTo = `${FEED_PATH}${listSearch}`;

  return (
    <div className="feed-article-page school-post-detail">
      <SchoolPostDetail
        key={schoolPostId}
        schoolPostId={schoolPostId}
        listSearch={listSearch}
        backTo={backTo}
        // UC-62: back to the feed (replace: the deleted post's page is not kept in the history).
        onDeleted={() => navigate(backTo, { replace: true })}
        leading={(post) => {
          const typeLabel = post ? POST_TYPE_LABELS[post.postType] ?? post.postType : '';
          return (
            <div>
              <Link to={backTo} className="back-link">
                <Icon name="arrow_back" size="sm" />
                Bảng tin trường
              </Link>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <span>EduConnect</span>/<Link to={backTo}>Bảng tin trường</Link>/
                {typeLabel && <span>{typeLabel}</span>}
                {typeLabel && '/'}
                <span className="current">Chi tiết</span>
              </nav>
            </div>
          );
        }}
      />
    </div>
  );
}
