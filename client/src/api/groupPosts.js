import { api } from './client.js';

// FE-05 Group Feed API (owner: Khanh), server/src/modules/posts. The server checks every permission; each post comes
// with `can: { interact, edit, delete, pin, hide, review }` and the screens show buttons from those flags only.

const postPath = (postId) => `/posts/${encodeURIComponent(postId)}`;

// UC-36 GET /groups/:groupId/posts?view=feed|mine|pending|hidden&page=&pageSize=
// -> { group: { requireApproval, readOnly, isModerator, moderatorMissing, canPost, maxPinned, ... },
//      counts: { mine, pinned, pending?, hidden? }, items, page, pageSize, total }
export async function listGroupPosts(groupId, params, { signal } = {}) {
  const { data } = await api.get(`/groups/${encodeURIComponent(groupId)}/posts`, { params, signal });
  return data;
}

// UC-38 POST /groups/:groupId/posts { content } -> 201 post (PENDING or APPROVED)
export async function createGroupPost(groupId, content) {
  const { data } = await api.post(`/groups/${encodeURIComponent(groupId)}/posts`, { content });
  return data;
}

// Approval switch (moderator): PUT /groups/:groupId/post-approval { requireApproval }
export async function setPostApproval(groupId, requireApproval) {
  const { data } = await api.put(`/groups/${encodeURIComponent(groupId)}/post-approval`, { requireApproval });
  return data;
}

// UC-37 GET /posts/:postId -> post + group { groupId, groupType, groupName, readOnly, isModerator }
export async function getGroupPost(postId, { signal } = {}) {
  const { data } = await api.get(postPath(postId), { signal });
  return data;
}

// UC-39 PATCH /posts/:postId { content } -> post (may go back to PENDING, business-rules §5)
export async function updateGroupPost(postId, content) {
  const { data } = await api.patch(postPath(postId), { content });
  return data;
}

// UC-40 DELETE /posts/:postId -> { postId, isDeleted }
export async function deleteGroupPost(postId) {
  const { data } = await api.delete(postPath(postId));
  return data;
}

// UC-43 PUT / DELETE /posts/:postId/like -> { likeCount, likedByMe } (idempotent)
export const groupPostLike = {
  like: async (postId) => (await api.put(`${postPath(postId)}/like`)).data,
  unlike: async (postId) => (await api.delete(`${postPath(postId)}/like`)).data,
};

// UC-41 / UC-42 calls in the shape the shared CommentThread expects.
export function groupPostCommentApi(postId) {
  return {
    list: async (params, { signal } = {}) => (await api.get(`${postPath(postId)}/comments`, { params, signal })).data,
    create: async (body) => (await api.post(`${postPath(postId)}/comments`, body)).data,
    remove: async (commentId) =>
      (await api.delete(`${postPath(postId)}/comments/${encodeURIComponent(commentId)}`)).data,
  };
}

// UC-44 / UC-45 / UC-46 (moderator) -> the post as it is now
export async function pinGroupPost(postId, isPinned) {
  return (await api.patch(`${postPath(postId)}/pin`, { isPinned })).data;
}

export async function hideGroupPost(postId, isHidden) {
  return (await api.patch(`${postPath(postId)}/hide`, { isHidden })).data;
}

export async function reviewGroupPost(postId, decision) {
  return (await api.post(`${postPath(postId)}/review`, { decision })).data;
}
