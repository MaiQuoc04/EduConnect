import * as service from './conversations.service.js';
import * as actions from './messageActions.service.js';
import * as direct from './direct.service.js';

export async function contacts(req, res) {
  const { q, classId } = req.query;
  res.json(await direct.listContacts(req.user, { q, classId }));
}

export async function openDirect(req, res) {
  const result = await direct.openDirect(req.user, req.body);
  res.status(result.created ? 201 : 200).json(result);
}

// Limits of the chat composer's file button (count, sizes from system_settings, the 15 types)
export async function attachmentLimits(_req, res) {
  res.json(await service.getMessageAttachmentLimits());
}

export async function list(req, res) {
  res.json(await service.listConversations(req.user));
}

export async function messages(req, res) {
  const { before, limit, from } = req.query;
  res.json(await service.listMessages(req.user, req.params.groupId, { before, limit, from }));
}

export async function send(req, res) {
  res.status(201).json(await service.sendMessage(req.user, req.params.groupId, req.body));
}

export async function setReaction(req, res) {
  const { groupId, messageId } = req.params;
  res.json(await actions.setReaction(req.user, groupId, messageId, req.body?.code));
}

export async function removeReaction(req, res) {
  const { groupId, messageId } = req.params;
  res.json(await actions.removeReaction(req.user, groupId, messageId));
}

export async function deleteMessage(req, res) {
  const { groupId, messageId } = req.params;
  res.json(await actions.deleteMessage(req.user, groupId, messageId, req.query.scope));
}

export async function read(req, res) {
  res.json(await service.markRead(req.user, req.params.groupId));
}
