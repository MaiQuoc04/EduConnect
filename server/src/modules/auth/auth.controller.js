import * as authService from './auth.service.js';

export async function signIn(req, res) {
  const { identifier, password } = req.body ?? {};
  res.json(await authService.signIn({ identifier, password, ip: req.ip }));
}

export async function switchRole(req, res) {
  const { userId, mustChangePassword } = req.user;
  res.json(await authService.switchRole({ userId, role: req.body?.role, mustChangePassword }));
}

export async function me(req, res) {
  const user = await authService.getMe(req.user.userId);
  res.json({ user, roles: req.user.roles, activeRole: req.user.activeRole });
}

export async function forgotPassword(req, res) {
  res.json(await authService.requestPasswordOtp({ email: req.body?.email, ip: req.ip }));
}

export async function verifyOtp(req, res) {
  const { email, otp } = req.body ?? {};
  res.json(await authService.verifyPasswordOtp({ email, otp }));
}

export async function resetPassword(req, res) {
  const { resetToken, newPassword } = req.body ?? {};
  res.json(await authService.resetPassword({ resetToken, newPassword, ip: req.ip }));
}
