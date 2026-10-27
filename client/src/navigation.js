// Left navigation rail (Stitch app shell). Each FE owner adds the screens they build here.
// `roles` = active roles that see the item (omit = everyone). The server still checks every API call.
// Icons: Material Symbols names. Example for FE-02:
//   { to: '/students', label: 'Học sinh', icon: 'school', roles: ['SCHOOL_MANAGER'] }
export const NAV_SECTIONS = [
  {
    label: 'Đào tạo',
    items: [
      { to: '/school-years', label: 'Năm học & học kỳ', icon: 'date_range', roles: ['SCHOOL_MANAGER'] }, // FE-04 UC-20, UC-21
      { to: '/subjects', label: 'Môn học', icon: 'book', roles: ['SCHOOL_MANAGER'] }, // FE-04 UC-22..UC-25
      { to: '/class-tracks', label: 'Loại lớp & hệ số', icon: 'category', roles: ['SCHOOL_MANAGER'] }, // FE-04 UC-26
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
  SYSTEM_ADMIN: '/profile',
  SCHOOL_MANAGER: '/profile',
  TEACHER: '/profile',
  STUDENT: '/profile',
  PARENT: '/profile',
};
