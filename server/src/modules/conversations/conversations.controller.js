import * as service from './conversations.service.js';

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
