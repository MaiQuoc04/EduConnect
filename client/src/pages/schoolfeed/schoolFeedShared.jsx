import { useEffect, useRef, useState } from 'react';
import { likeSchoolPost, unlikeSchoolPost } from '../../api/schoolPosts.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { formatDate } from '../../utils/format.js';

// FE-08 School Feed: pieces shared by SCR-02 School Feed and SCR-05 School Post Detail.

// Roles that see the school feed (permissions.md "School post – View"). System Admin sees no content (§1).
export const SCHOOL_FEED_ROLES = ['SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'];

export const POST_TYPE_LABELS = { ANNOUNCEMENT: 'Thông báo', NEWS: 'Tin tức' };

// TODO FE-08: move these to messages.js once the lead approves the codes (waiting list in the FE-08 summary).
// MSG_INVALID_PARAM is not in messages.js yet either.
const PENDING_MESSAGES = {
  MSG_SCHOOL_POST_NOT_FOUND: 'Không tìm thấy bài viết.',
  MSG_CANNOT_REACT_NEWS: 'Không thể bày tỏ cảm xúc với tin tức.',
  MSG_CANNOT_PIN_NEWS: 'Chỉ ghim được thông báo, không ghim được tin tức.',
  MSG_INVALID_PARAM: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.',
};

// Vietnamese text for an API error: the pending codes above, then messages.js; an unknown code gets `fallback`
// (never the English server text) and a console warning.
export function feedErrorText(err, fallback) {
  if (PENDING_MESSAGES[err?.code]) return PENDING_MESSAGES[err.code];
  const generic = errorText({ code: 'SERVER_ERROR' });
  const text = errorText({ code: err?.code, details: err?.details });
  if (text === generic && err?.code !== 'SERVER_ERROR') {
    console.warn(`[SchoolFeed] No Vietnamese message for error code ${err?.code}:`, err?.message);
    return fallback;
  }
  return text;
}

// Hands the UC-59 object saved by SCR-31 / SCR-06 to SCR-05, so the detail page shows the server's answer without a
// new request (same one-slot hand-off as FE-02 detailHandoff.js: history.back() cannot carry router state).
let handedOverPost = null;
export function handOverPost(data) {
  handedOverPost = data;
}
// Not destructive, so StrictMode's double render reads the same value; call clearHandedOverPost() once shown.
export function peekHandedOverPost(schoolPostId) {
  return handedOverPost?.post?.schoolPostId === schoolPostId ? handedOverPost : null;
}
export function clearHandedOverPost() {
  handedOverPost = null;
}

// "2026-10-27 05:57:01+07" (Vietnam time from the API) -> "05:57, 27/10/2026" (as the other FE screens).
export function formatDateTime(value) {
  if (!value) return '';
  return `${String(value).slice(11, 16)}, ${formatDate(value)}`;
}

// UC-61 changes updated_at; pinning does not (server). Same value or no value = never edited.
export const isEdited = (post) => Boolean(post.updatedAt) && post.updatedAt !== post.createdAt;

// Who the post was sent to, from UC-58 audienceSummary (null = whole school, business-rules §8).
// ASSUMPTION: a targeted post whose target classes were all deleted later has no names left; it shows
// "Lớp đã chọn" rather than "Toàn trường", which would be wrong (the server still treats it as targeted).
export function audienceLabels(summary) {
  if (!summary) return ['Toàn trường'];
  const labels = [
    ...summary.gradeLevelNames.map((name) => `Khối ${name}`),
    ...summary.classNames.map((name) => `Lớp ${name}`),
  ];
  return labels.length ? labels : ['Lớp đã chọn'];
}

// Same, from the UC-59 targets of the detail page.
export function targetLabels(post) {
  if (post.audienceType === 'SCHOOL') return [{ key: 'school', text: 'Toàn trường' }];
  const labels = [
    ...post.gradeTargets.map((g) => ({ key: `g${g.gradeLevelId}`, text: `Khối ${g.gradeLevelName}` })),
    ...post.classTargets.map((c) => ({
      key: `c${c.classId}`,
      text: `Lớp ${c.className}`,
      title: `Năm học ${String(c.schoolYearName ?? '').replace('-', ' – ')}`,
    })),
  ];
  return labels.length ? labels : [{ key: 'none', text: 'Lớp đã chọn' }];
}

/**
 * UC-64 Like / unlike with an optimistic count. Clicks never send two requests at once: while one is on its way,
 * further clicks only change the wanted state; when the answer arrives, one more request is sent if the wanted state
 * differs from the server's. So five quick clicks end liked, with at most two requests, and the count shown is the
 * server's in the end. On an error the server's last known state comes back and onError gets the error.
 */
export function useLike(schoolPostId, likedByMe, likeCount, onError) {
  const confirmed = useRef({ likedByMe, likeCount });
  const wanted = useRef(likedByMe);
  const busy = useRef(false);
  const [view, setView] = useState({ likedByMe, likeCount });

  // A reloaded list or detail brings fresh numbers; take them unless a request is on its way.
  useEffect(() => {
    if (busy.current) return;
    confirmed.current = { likedByMe, likeCount };
    wanted.current = likedByMe;
    setView({ likedByMe, likeCount });
  }, [schoolPostId, likedByMe, likeCount]);

  async function send() {
    busy.current = true;
    try {
      while (wanted.current !== confirmed.current.likedByMe) {
        const request = wanted.current ? likeSchoolPost : unlikeSchoolPost;
        confirmed.current = await request(schoolPostId);
      }
      setView({ ...confirmed.current });
    } catch (err) {
      wanted.current = confirmed.current.likedByMe;
      setView({ ...confirmed.current });
      onError?.(err);
    } finally {
      busy.current = false;
    }
  }

  function toggle() {
    wanted.current = !wanted.current;
    const { likedByMe: was, likeCount: count } = confirmed.current;
    setView({ likedByMe: wanted.current, likeCount: count + (wanted.current ? 1 : 0) - (was ? 1 : 0) });
    if (!busy.current) send();
  }

  return { ...view, toggle };
}

const number = (n) => n.toLocaleString('vi-VN');

// The Like button (announcements only; never rendered for NEWS, §8).
export function LikeButton({ liked, count, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`sf-like${liked ? ' is-liked' : ''} ${className}`.trim()}
      aria-pressed={liked}
      onClick={onClick}
    >
      <Icon name="favorite" filled={liked} />
      <span>
        Thích <span className="mono">({number(count)})</span>
      </span>
    </button>
  );
}

export function CommentCount({ count }) {
  return (
    <span className="sf-comments">
      <Icon name="chat_bubble" />
      <span>
        Bình luận <span className="mono">({number(count)})</span>
      </span>
    </span>
  );
}
