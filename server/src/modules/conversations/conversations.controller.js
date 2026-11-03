import * as service from './conversations.service.js';
import * as direct from './direct.service.js';

export async function contacts(req, res) {
  const { q, classId } = req.query;
  res.json(await direct.listContacts(req.user, { q, classId }));
}

export async function openDirect(req, res) {
  const result = await direct.openDirect(req.user, req.body);
  res.status(result.created ? 201 : 200).json(result);
}

export async function list(req, res) {
  res.json(await service.listConversations(req.user));
}

export async function messages(req, res) {
  const { before, limit } = req.query;
  res.json(await service.listMessages(req.user, req.params.groupId, { before, limit }));
}

export async function send(req, res) {
  res.status(201).json(await service.sendMessage(req.user, req.params.groupId, req.body));
}

export async function read(req, res) {
  res.json(await service.markRead(req.user, req.params.groupId));
}
