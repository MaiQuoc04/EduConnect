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

// The role dimension of the audience (school_posts.target_roles), multiplied with grades / classes:
// "Khối 10 · Phụ huynh" = the parents of grade 10. [] (or all three) = every role, as every post of before.
export const TARGETABLE_ROLES = ['STUDENT', 'PARENT', 'TEACHER'];
export const ROLE_LABELS = { STUDENT: 'Học sinh', PARENT: 'Phụ huynh', TEACHER: 'Giáo viên' };
// The roles that narrow the audience, in display order; [] when every role gets the post.
export function narrowingRoles(roles = []) {
  const chosen = TARGETABLE_ROLES.filter((role) => roles.includes(role));
  return chosen.length === TARGETABLE_ROLES.length ? [] : chosen;
}
export const roleLabels = (roles) => narrowingRoles(roles).map((role) => ROLE_LABELS[role]);

// The role half of "Gửi tới": "Học sinh, Phụ huynh", or "Tất cả" when every role gets the post ([] or all three).
export const ALL_ROLES_TEXT = 'Tất cả';
export const rolesText = (roles) => roleLabels(roles).join(', ') || ALL_ROLES_TEXT;

// An announcement with no grade / class yet (business-rules §8: it needs one); never shown as "Toàn trường".
export const NO_AUDIENCE_TEXT = 'Chưa chọn đối tượng nhận';

/**
 * The scope half: "Khối 10, Lớp 11D1". With `max`, a long list keeps its first `max` names and counts the rest:
 * "Khối 10, Lớp 11D1 và 3 lớp khác" (or "khối khác" / "mục khác" when the rest are grades / mixed). One name more
 * than `max` is written out (never "và 1 lớp khác").
 */
export function scopeText(scopeLabels, max = Infinity) {
  if (scopeLabels.length <= max + 1) return scopeLabels.join(', ');
  const rest = scopeLabels.slice(max);
  const kind = rest.every((t) => t.startsWith('Lớp ')) ? 'lớp' : rest.every((t) => t.startsWith('Khối ')) ? 'khối' : 'mục';
  return `${scopeLabels.slice(0, max).join(', ')} và ${rest.length} ${kind} khác`;
}

// How many grade / class names the short "Gửi tới" lines (feed card, form summary, preview) keep; the confirmation
// dialog and the detail page list them all.
export const SHORT_SCOPE = 2;

// One line for both dimensions, "<phạm vi> · <vai trò>": "Khối 10, Lớp 11D1 · Phụ huynh", "Toàn trường · Tất cả".
// scopeLabels null = an announcement with nothing chosen yet → NO_AUDIENCE_TEXT.
export const audienceText = (scopeLabels, roles, max = Infinity) =>
  scopeLabels ? `${scopeText(scopeLabels, max)} · ${rolesText(roles)}` : NO_AUDIENCE_TEXT;

/**
 * The same line as markup, for the feed card, the detail page and the form: the scope, a "·", the roles; the empty
 * state of an announcement in grey. A shortened line carries the full one in its title (hover).
 */
export function AudienceLine({ scopeLabels, roles, max = Infinity, className = '' }) {
  if (!scopeLabels) return <span className={`sf-audience-line is-pending ${className}`.trim()}>{NO_AUDIENCE_TEXT}</span>;
  const full = audienceText(scopeLabels, roles);
  const short = scopeText(scopeLabels, max);
  return (
    <span className={`sf-audience-line ${className}`.trim()} title={short !== scopeLabels.join(', ') ? full : undefined}>
      <span className="sf-audience-scope">{short}</span>
      <span className="sf-audience-sep">{' · '}</span>
      <span className="sf-audience-roles">{rolesText(roles)}</span>
    </span>
  );
}

// Who the post was sent to, from UC-58 audienceSummary (null = whole school for every role, business-rules §8; a
// whole-school post for some roles has empty names and its targetRoles).
// ASSUMPTION: a targeted post whose target classes were all deleted later has no names left; it shows
// "Lớp đã chọn" rather than "Toàn trường", which would be wrong (the server still treats it as targeted).
export function audienceLabels(summary, audienceType) {
  if (!summary || audienceType === 'SCHOOL') return ['Toàn trường'];
  const labels = [
    ...summary.gradeLevelNames.map((name) => `Khối ${name}`),
    ...summary.classNames.map((name) => `Lớp ${name}`),
  ];
  return labels.length ? labels : ['Lớp đã chọn'];
}

// "Gửi tới" of a UC-58 feed item, both dimensions, shortened as the form summary.
export function FeedAudience({ post }) {
  return (
    <AudienceLine
      scopeLabels={audienceLabels(post.audienceSummary, post.audienceType)}
      roles={post.audienceSummary?.targetRoles}
      max={SHORT_SCOPE}
    />
  );
}

// Scope labels of the UC-59 targets of the detail page, all of them (the roles are post.targetRoles).
export function targetScopeLabels(post) {
  if (post.audienceType === 'SCHOOL') return ['Toàn trường'];
  const labels = [
    ...post.gradeTargets.map((g) => `Khối ${g.gradeLevelName}`),
    ...post.classTargets.map((c) => `Lớp ${c.className}`),
  ];
  return labels.length ? labels : ['Lớp đã chọn'];
}

/**
 * UC-64 Like / unlike with an optimistic count. Clicks never send two requests at once: while one is on its way,
 * further clicks only change the wanted state; when the answer arrives, one more request is sent if the wanted state
 * differs from the server's. So five quick clicks end liked, with at most two requests, and the count shown is the
 * server's in the end. On an error the server's last known state comes back and onError gets the error.
 */
// `requests` lets FE-05 Group Feed reuse the hook with its own calls; FE-08 keeps the default (school posts).
const SCHOOL_POST_LIKE = { like: likeSchoolPost, unlike: unlikeSchoolPost };
export function useLike(schoolPostId, likedByMe, likeCount, onError, requests = SCHOOL_POST_LIKE) {
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
        const request = wanted.current ? requests.like : requests.unlike;
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
