// FE-13 (owner: Linh): the System Admin's profile pages, one per account type (supervisor's request, 22/11/2026).
// Each page lists the accounts of one role (UC-97 with the role fixed) and creates them one by one (UC-95) or from a
// file (UC-96) of that type. The School Manager page is the only place School Manager accounts are created.
// System Admin sees, creates and imports these accounts, and edits only the fields of the import file (UC-99);
// classes, parent links, subjects and assignments stay with the School Manager.

export const PROFILE_KINDS = {
  students: {
    role: 'STUDENT',
    label: 'Học sinh',
    title: 'Hồ sơ học sinh',
    icon: 'school',
    intro: 'Tạo, nhập từ file và sửa thông tin cơ bản của tài khoản học sinh. Lớp học do quản lý nhà trường xếp.',
    classFilter: true,
  },
  teachers: {
    role: 'TEACHER',
    label: 'Giáo viên',
    title: 'Hồ sơ giáo viên',
    icon: 'co_present',
    intro: 'Tạo, nhập từ file và sửa thông tin cơ bản của tài khoản giáo viên. Môn dạy và phân công do quản lý nhà trường cập nhật.',
    classFilter: true,
  },
  parents: {
    role: 'PARENT',
    label: 'Phụ huynh',
    title: 'Hồ sơ phụ huynh',
    icon: 'family_restroom',
    intro: 'Tạo, nhập từ file và sửa thông tin cơ bản của tài khoản phụ huynh. Liên kết với học sinh do quản lý nhà trường thực hiện.',
    classFilter: true,
  },
  'school-managers': {
    role: 'SCHOOL_MANAGER',
    label: 'Quản lý nhà trường',
    title: 'Quản lý nhà trường',
    icon: 'domain',
    intro: 'Tạo, nhập từ file và sửa thông tin của tài khoản quản lý nhà trường. Chỉ quản trị hệ thống tạo được loại tài khoản này.',
    classFilter: false,
  },
};

export const listPath = (kind) => `/admin/${kind}`;

// The profile page an account belongs to, for breadcrumbs: its first role in this order, else the all-accounts list.
const ORDER = ['students', 'teachers', 'parents', 'school-managers'];
export function kindOfRoles(roles = []) {
  return ORDER.find((k) => roles.includes(PROFILE_KINDS[k].role)) ?? null;
}

export function backOf(roles) {
  const kind = kindOfRoles(roles);
  return kind ? { to: listPath(kind), label: PROFILE_KINDS[kind].title } : { to: '/admin/accounts', label: 'Tài khoản' };
}
