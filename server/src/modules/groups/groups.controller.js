import * as groupService from './groups.service.js';
import * as memberService from './groupMembers.service.js';
import * as teamService from './teams.service.js';

export async function list(req, res) {
  res.json(await groupService.listMyGroups(req.user, { schoolYearId: req.query.schoolYearId }));
}

export async function detail(req, res) {
  res.json(await groupService.getGroup(req.user, req.params.id));
}

export async function members(req, res) {
  res.json(await groupService.listMembers(req.user, req.params.id));
}

export async function candidates(req, res) {
  res.json(await memberService.listCandidates(req.user, req.params.id));
}

export async function addMembers(req, res) {
  res.status(201).json(await memberService.addMembers(req.user, req.params.id, req.body?.userIds));
}

export async function removeMember(req, res) {
  res.json(await memberService.removeMember(req.user, req.params.id, req.params.userId));
}

export async function setNickname(req, res) {
  res.json(await memberService.setNickname(req.user, req.params.id, req.params.userId, req.body?.nickname));
}

export async function teamOptions(req, res) {
  res.json(await teamService.teamOptions(req.user));
}

export async function createTeam(req, res) {
  const { classId, teamName, memberIds } = req.body ?? {};
  res.status(201).json(await teamService.createTeam(req.user, { classId, teamName, memberIds }));
}

export async function leave(req, res) {
  res.json(await teamService.leaveTeam(req.user, req.params.id));
}
