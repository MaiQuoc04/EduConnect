import * as authService from './auth.service.js';

export async function signIn(req, res) {
  const { identifier, password } = req.body ?? {};
  res.json(await authService.signIn({ identifier, password, ip: req.ip }));
}

export async function switchRole(req, res) {
  res.json(await authService.switchRole({ userId: req.user.userId, role: req.body?.role }));
}

export async function me(req, res) {
  const user = await authService.getMe(req.user.userId);
  res.json({ user, roles: req.user.roles, activeRole: req.user.activeRole });
}
