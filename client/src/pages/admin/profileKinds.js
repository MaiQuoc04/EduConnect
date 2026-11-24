// FE-13 (owner: Linh): the System Admin's account pages, one per account type (supervisor's request, 22/11/2026;
// menu group "Quản lý tài khoản" since 23/11/2026, which replaced the list of every account).
// Each page lists the accounts of one role (UC-97 with the role fixed) and creates them one by one (UC-95) or from a
// file (UC-96) of that type. The School Manager page is the only place School Manager accounts are created.
// System Admin sees, creates and imports these accounts, and edits only the fields of the import file (UC-99);
// classes, parent links, subjects and assignments stay with the School Manager.
// System Admin accounts (23/11/2026) are listed, edited, locked and reset like the others, but never created here:
// they come from `npm run seed:admin` (business rules §3), so that page has `canCreate: false`.
// School Manager (23/11/2026) uses the same create and import pages for students, teachers and parents, opened from
// their own lists (`school`: the list path and title on the School Manager side).

export const PROFILE_KINDS = {
  students: {
    role: 'STUDENT',
    label: 'Học sinh',
    title: 'Tài khoản học sinh',
    icon: 'school',
    intro: 'Tạo, nhập từ file và sửa thông tin cơ bản của tài khoản học sinh. Lớp học do quản lý nhà trường xếp.',
    classFilter: true,
    canCreate: true,
    school: { to: '/students', label: 'Học sinh' },
  },
  teachers: {
    role: 'TEACHER',
    label: 'Giáo viên',
    title: 'Tài khoản giáo viên',
    icon: 'co_present',
    intro: 'Tạo, nhập từ file và sửa thông tin cơ bản của tài khoản giáo viên. Môn dạy và phân công do quản lý nhà trường cập nhật.',
    classFilter: true,
    canCreate: true,
    school: { to: '/teachers', label: 'Giáo viên' },
  },
  parents: {
    role: 'PARENT',
    label: 'Phụ huynh',
    title: 'Tài khoản phụ huynh',
    icon: 'family_restroom',
    intro: 'Tạo, nhập từ file và sửa thông tin cơ bản của tài khoản phụ huynh. Liên kết với học sinh do quản lý nhà trường thực hiện.',
    classFilter: true,
    canCreate: true,
    school: { to: '/parents', label: 'Phụ huynh' },
  },
  'school-managers': {
    role: 'SCHOOL_MANAGER',
    label: 'Quản lý nhà trường',
    title: 'Tài khoản quản lý nhà trường',
    icon: 'domain',
    intro: 'Tạo, nhập từ file và sửa thông tin của tài khoản quản lý nhà trường. Chỉ quản trị hệ thống tạo được loại tài khoản này.',
    classFilter: false,
    canCreate: true,
  },
  'system-admins': {
    role: 'SYSTEM_ADMIN',
    label: 'Quản trị hệ thống',
    title: 'Tài khoản quản trị hệ thống',
    icon: 'admin_panel_settings',
    intro:
      'Xem, sửa, khoá và đặt lại mật khẩu cho tài khoản quản trị hệ thống. Tài khoản quản trị không được tạo trên giao diện; bạn không thể tự khoá tài khoản của mình.',
    classFilter: false,
    canCreate: false,
  },
};

export const listPath = (kind) => `/admin/${kind}`;

// The page an account belongs to, for breadcrumbs: its first role in this order.
const ORDER = ['students', 'teachers', 'parents', 'school-managers', 'system-admins'];
export function kindOfRoles(roles = []) {
  return ORDER.find((k) => roles.includes(PROFILE_KINDS[k].role)) ?? null;
}

// The list a create / import page goes back to: the School Manager's own list, else the System Admin's page.
export function listOf(kind, activeRole) {
  const profile = PROFILE_KINDS[kind];
  return activeRole === 'SCHOOL_MANAGER' && profile.school ? profile.school : { to: listPath(kind), label: profile.title };
}

export function backOf(roles) {
  const kind = kindOfRoles(roles) ?? 'students';
  return { to: listPath(kind), label: PROFILE_KINDS[kind].title };
}
