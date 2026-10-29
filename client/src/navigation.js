// Left navigation rail (Stitch app shell). Each FE owner adds the screens they build here.
// `roles` = active roles that see the item (omit = everyone). The server still checks every API call.
// Icons: Material Symbols names. Example for FE-02:
//   { to: '/students', label: 'Học sinh', icon: 'school', roles: ['SCHOOL_MANAGER'] }
export const NAV_SECTIONS = [
  {
    label: 'Quản trị hệ thống', // School Manager sees only the password reset requests here
    items: [
      // FE-13 System Administration
      { to: '/admin/accounts', label: 'Tài khoản người dùng', icon: 'manage_accounts', roles: ['SYSTEM_ADMIN'] }, // UC-92..98
      { to: '/admin/password-reset-requests', label: 'Yêu cầu cấp lại mật khẩu', icon: 'key', roles: ['SYSTEM_ADMIN', 'SCHOOL_MANAGER'] }, // UC-97 via FE-01 requests
      { to: '/admin/settings', label: 'Cài đặt hệ thống', icon: 'settings', roles: ['SYSTEM_ADMIN'] }, // UC-99
      { to: '/admin/maintenance', label: 'Bảo trì hệ thống', icon: 'engineering', roles: ['SYSTEM_ADMIN'] }, // UC-100
    ],
  },
  {
    label: 'Tài khoản',
    items: [
      { to: '/profile', label: 'Hồ sơ của tôi', icon: 'person' }, // FE-01 UC-04
      { to: '/change-password', label: 'Đổi mật khẩu', icon: 'lock_reset' }, // FE-01 UC-05
    ],
  },
];

export function navFor(activeRole) {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(activeRole)),
  })).filter((section) => section.items.length);
}

// Where each role lands after sign-in (the product has no dashboard). Update when the role's main screen exists.
export const HOME_BY_ROLE = {
  SYSTEM_ADMIN: '/admin/accounts',
  SCHOOL_MANAGER: '/profile',
  TEACHER: '/profile',
  STUDENT: '/profile',
  PARENT: '/profile',
};
