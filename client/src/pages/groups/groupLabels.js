// Vietnamese labels for groups (FE-04 UC-29..31).
export const GROUP_TYPE_LABELS = {
  GENERAL: 'Nhóm chung',
  STUDENT: 'Nhóm học sinh',
  PARENT: 'Nhóm phụ huynh',
  TEACHER_SCHOOL: 'Nhóm giáo viên toàn trường',
};

export const GROUP_TYPE_HELP = {
  GENERAL: 'Giáo viên, học sinh và phụ huynh của lớp',
  STUDENT: 'Giáo viên chủ nhiệm và học sinh',
  PARENT: 'Giáo viên chủ nhiệm và phụ huynh',
  TEACHER_SCHOOL: 'Toàn bộ giáo viên và quản lý trường',
};

export const GROUP_TYPE_ICONS = { GENERAL: 'groups', STUDENT: 'school', PARENT: 'family_restroom', TEACHER_SCHOOL: 'co_present' };

// Why someone is a member (worked out by the server).
export const MEMBER_KIND_LABELS = {
  HOMEROOM: 'Giáo viên chủ nhiệm',
  SUBJECT_TEACHER: 'Giáo viên bộ môn',
  TEACHER: 'Giáo viên',
  MANAGER: 'Quản lý trường',
  STUDENT: 'Học sinh',
  PARENT: 'Phụ huynh',
  OTHER: 'Thành viên',
};
