// The temporary password the user has just signed in with (UC-01 → forced change, UC-05), kept ONLY in memory for
// this tab: never in localStorage / sessionStorage, gone on reload, sign-out or once the password is changed.
// SCR-34 compares the new password with it, so "Khác mật khẩu cũ gần nhất" can be ticked while typing although the
// forced change does not ask for the current password (FE-13 owner, 27/11/2026). The server checks it anyway.
let value = null;

export const temporaryPassword = {
  remember: (password) => {
    value = typeof password === 'string' && password ? password : null;
  },
  get: () => value,
  forget: () => {
    value = null;
  },
};
