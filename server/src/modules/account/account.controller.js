import * as accountService from './account.service.js';

export async function profile(req, res) {
  res.json(await accountService.getProfile(req.user));
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body ?? {};
  res.json(await accountService.changePassword({ user: req.user, currentPassword, newPassword }));
}

export async function changeAvatar(req, res) {
  res.json(await accountService.changeAvatar({ userId: req.user.userId, file: req.file }));
}
