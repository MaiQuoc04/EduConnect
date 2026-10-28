import { Link, useOutletContext } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { groupHasFeed } from './groupLabels.js';

const TEXT = {
  feed: {
    icon: 'dynamic_feed',
    title: 'Bảng tin',
    body: 'Nơi giáo viên, học sinh và phụ huynh đăng bài, bình luận và xem thông báo của nhóm.',
  },
};

// SCR-23 placeholder tab until FE-05 Group Feed (owner: Anh) plugs its page into the "feed" route in App.jsx.
// Access follows the group: no content for the School Manager in class groups (canSeeContent) and no feed for
// chat-only groups. Chat lives in the split view at /chat/:groupId (pages/chat/ChatPage.jsx).
export default function GroupPendingTab({ kind }) {
  const g = useOutletContext();
  const t = TEXT[kind];
  const blocked = !g.canSeeContent || (kind === 'feed' && !groupHasFeed(g.groupType));

  return (
    <section className="card card-outline gd-pending">
      <span className="gd-pending-icon" aria-hidden="true">
        <Icon name={blocked ? 'lock' : t.icon} />
      </span>
      <h2 className="title-md">{t.title}</h2>
      {blocked ? (
        <p className="muted">
          {g.canSeeContent
            ? 'Nhóm này chỉ dùng để trò chuyện, không có bảng tin.'
            : 'Quản lý trường không xem bảng tin và tin nhắn của nhóm lớp.'}
        </p>
      ) : (
        <>
          <p className="muted">{t.body}</p>
          <p className="stamp-soft">
            <Icon name="construction" size="sm" />
            Chức năng đang được phát triển
          </p>
        </>
      )}
      <Link to=".." relative="path" className="btn btn-secondary">
        <Icon name="arrow_back" size="sm" />
        Về tổng quan nhóm
      </Link>
    </section>
  );
}
