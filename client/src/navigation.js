// Left navigation rail (Stitch app shell). Each FE owner adds the screens they build here.
// `roles` = active roles that see the item (omit = everyone). The server still checks every API call.
// Icons: Material Symbols names. Example for FE-02:
//   { to: '/students', label: 'Học sinh', icon: 'school', roles: ['SCHOOL_MANAGER'] }
export const NAV_SECTIONS = [
  {
    label: 'Quản trị hệ thống', // School Manager sees only the password reset requests here
    items: [
      // FE-13 System Administration
      { to: '/admin/accounts', label: 'Tài khoản người dùng', icon: 'manage_accounts', roles: ['SYSTEM_ADMIN'] }, // UC-95..98
      { to: '/admin/password-reset-requests', label: 'Yêu cầu cấp lại mật khẩu', icon: 'key', roles: ['SYSTEM_ADMIN', 'SCHOOL_MANAGER'] }, // UC-100 via FE-01 requests
      { to: '/admin/settings', label: 'Cài đặt hệ thống', icon: 'settings', roles: ['SYSTEM_ADMIN'] }, // UC-102
      { to: '/admin/maintenance', label: 'Bảo trì hệ thống', icon: 'engineering', roles: ['SYSTEM_ADMIN'] }, // UC-103
    ],
  },
  {
    label: 'Cộng đồng',
    items: [
      { to: '/groups', label: 'Nhóm của tôi', icon: 'groups', roles: ['TEACHER', 'STUDENT', 'PARENT'] }, // FE-04 UC-29
      { to: '/chat', label: 'Trò chuyện', icon: 'forum', roles: ['TEACHER', 'STUDENT', 'PARENT'] }, // FE-06 shell (FE-04)
    ],
  },
  {
    label: 'Đào tạo',
    items: [
      { to: '/school-years', label: 'Năm học & học kỳ', icon: 'date_range', roles: ['SCHOOL_MANAGER'] }, // FE-04 UC-20, UC-21
      { to: '/subjects', label: 'Môn học', icon: 'book', roles: ['SCHOOL_MANAGER'] }, // FE-04 UC-22..UC-25
      { to: '/class-tracks', label: 'Loại lớp & số tiết', icon: 'category', roles: ['SCHOOL_MANAGER'] }, // FE-04 UC-26
      { to: '/classes', label: 'Lớp & nhóm', icon: 'groups', roles: ['SCHOOL_MANAGER'] }, // FE-04 UC-27..UC-29
    ],
  },
  {
    label: 'Tài khoản',
    items: [
      { to: '/profile', label: 'Hồ sơ của tôi', icon: 'person' }, // FE-01 UC-04
      { to: '/change-password', label: 'Đổi mật khẩu', icon: 'lock_reset' }, // FE-01 UC-05
    ],
  },
  {
    label: 'Hồ sơ',
    items: [
      { to: '/teachers', label: 'Giáo viên', icon: 'badge', roles: ['SCHOOL_MANAGER'] }, // SCR-13
      { to: '/homeroom-assignments', label: 'Phân công chủ nhiệm', icon: 'assignment_ind', roles: ['SCHOOL_MANAGER'] }, // SCR-16
      { to: '/teaching-assignments', label: 'Phân công giảng dạy', icon: 'co_present', roles: ['SCHOOL_MANAGER'] }, // SCR-17
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
