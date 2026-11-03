import * as accountService from './account.service.js';

export async function profile(req, res) {
  res.json(await accountService.getProfile(req.user));
}

export async function childProfile(req, res) {
  res.json(await accountService.getChildProfile({ userId: req.user.userId, studentId: req.params.studentId }));
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body ?? {};
  res.json(await accountService.changePassword({ user: req.user, currentPassword, newPassword }));
}

export async function changeAvatar(req, res) {
  res.json(await accountService.changeAvatar({ userId: req.user.userId, file: req.file }));
}

export async function updateAddress(req, res) {
  res.json(await accountService.updateAddress({ userId: req.user.userId, address: req.body?.address }));
}

export async function updateOccupation(req, res) {
  res.json(await accountService.updateOccupation({ userId: req.user.userId, occupation: req.body?.occupation }));
}
