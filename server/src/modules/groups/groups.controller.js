import * as groupService from './groups.service.js';

export async function list(req, res) {
  res.json(await groupService.listMyGroups(req.user, { schoolYearId: req.query.schoolYearId }));
}

export async function detail(req, res) {
  res.json(await groupService.getGroup(req.user, req.params.id));
}

export async function members(req, res) {
  res.json(await groupService.listMembers(req.user, req.params.id));
}
