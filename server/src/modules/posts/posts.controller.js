import {
  invalid,
  jsonBody,
  optionalEnum,
  optionalInt,
  parseId,
  requiredBoolean,
  requiredText,
} from '../../utils/requestParsers.js';
import * as service from './posts.service.js';

// FE-05 Group Feed (owner: Khanh). Checks the request; rules and SQL live in posts.service.js.

const DEFAULT_PAGE_SIZE = 20; // as FE-08
const MAX_PAGE_SIZE = 50;
const MAX_POST_LENGTH = 5000; // business-rules §5 (11/11/2026)
const MAX_COMMENT_LENGTH = 2000; // business-rules §5, as FE-08

const paging = (query) => ({
  page: optionalInt(query, 'page', { fallback: 1 }),
  pageSize: optionalInt(query, 'pageSize', { max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
});
const groupIdOf = (req) => parseId(req.params.groupId, 'groupId');
const postIdOf = (req) => parseId(req.params.postId, 'postId');

// UC-36 View Group Feed (view = feed | mine | pending | hidden)
export async function list(req, res) {
  const view = optionalEnum(req.query, 'view', service.VIEWS, 'feed');
  res.json(await service.listPosts(req.user, groupIdOf(req), { view, ...paging(req.query) }));
}

// UC-38 Create Post
export async function create(req, res) {
  const content = requiredText(jsonBody(req, ['content']), 'content', MAX_POST_LENGTH);
  res.status(201).json(await service.createPost(req.user, groupIdOf(req), { content }));
}

// Approval switch on the group detail screen (business-rules §5, 11/11/2026)
export async function setApproval(req, res) {
  const requireApproval = requiredBoolean(jsonBody(req, ['requireApproval']), 'requireApproval');
  res.json(await service.setRequireApproval(req.user, groupIdOf(req), requireApproval));
}

// UC-37 View Post Detail
export async function detail(req, res) {
  res.json(await service.getPost(req.user, postIdOf(req)));
}

// UC-39 Edit Own Post
export async function update(req, res) {
  const content = requiredText(jsonBody(req, ['content']), 'content', MAX_POST_LENGTH);
  res.json(await service.updatePost(req.user, postIdOf(req), { content }));
}

// UC-40 Delete Own Post
export async function remove(req, res) {
  res.json(await service.deletePost(req.user, postIdOf(req)));
}

// UC-43 React to Post: PUT likes, DELETE unlikes (both idempotent, a double click never undoes itself)
export async function like(req, res) {
  res.json(await service.setLike(req.user, postIdOf(req), true));
}

export async function unlike(req, res) {
  res.json(await service.setLike(req.user, postIdOf(req), false));
}

// UC-41 (reading the comments of SCR-37)
export async function listComments(req, res) {
  res.json(await service.listComments(req.user, postIdOf(req), paging(req.query)));
}

// UC-41 Comment on Post (a reply when parentCommentId is given, any level)
export async function createComment(req, res) {
  const body = jsonBody(req, ['content', 'parentCommentId']);
  const content = requiredText(body, 'content', MAX_COMMENT_LENGTH);
  const raw = body.parentCommentId;
  if (raw != null && !(Number.isSafeInteger(raw) && raw >= 1)) throw invalid('parentCommentId'); // a JSON number
  const parentCommentId = raw ?? null;
  res.status(201).json(await service.createComment(req.user, postIdOf(req), { content, parentCommentId }));
}

// UC-42 Delete Comment / UC-45 (moderator)
export async function removeComment(req, res) {
  res.json(await service.deleteComment(req.user, postIdOf(req), parseId(req.params.commentId, 'commentId')));
}

// UC-44 Pin / Unpin Post
export async function pin(req, res) {
  const isPinned = requiredBoolean(jsonBody(req, ['isPinned']), 'isPinned');
  res.json(await service.setPinned(req.user, postIdOf(req), isPinned));
}

// UC-45 Hide / Unhide Post
export async function hide(req, res) {
  const isHidden = requiredBoolean(jsonBody(req, ['isHidden']), 'isHidden');
  res.json(await service.setHidden(req.user, postIdOf(req), isHidden));
}

// UC-46 Approve / Reject Post
export async function review(req, res) {
  const { decision } = jsonBody(req, ['decision']);
  if (decision !== 'APPROVE' && decision !== 'REJECT') throw invalid('decision');
  res.json(await service.reviewPost(req.user, postIdOf(req), decision));
}
