// Vietnamese labels for groups (FE-04 UC-29..31).
export const GROUP_TYPE_LABELS = {
  GENERAL: 'Nhóm chung',
  STUDENT: 'Nhóm học sinh',
  PARENT: 'Nhóm phụ huynh',
  TEACHER_SCHOOL: 'Nhóm giáo viên toàn trường',
  TEAM_CHAT: 'Team',
};

export const GROUP_TYPE_HELP = {
  GENERAL: 'Giáo viên, học sinh và phụ huynh của lớp',
  STUDENT: 'Giáo viên chủ nhiệm và học sinh',
  PARENT: 'Giáo viên chủ nhiệm và phụ huynh',
  TEACHER_SCHOOL: 'Toàn bộ giáo viên và quản lý trường',
  TEAM_CHAT: 'Chỉ trò chuyện giữa các thành viên được chọn',
};

// What each group is for (business-rules §4: GENERAL and the teacher group have a feed, the others are chat only).
export const GROUP_TYPE_DESC = {
  GENERAL: 'Bảng tin và trò chuyện chung của lớp với giáo viên, học sinh và phụ huynh.',
  STUDENT: 'Trò chuyện giữa giáo viên chủ nhiệm và học sinh của lớp.',
  PARENT: 'Trò chuyện giữa giáo viên chủ nhiệm và phụ huynh của lớp.',
  TEACHER_SCHOOL: 'Bảng tin và trò chuyện của toàn bộ giáo viên và quản lý trường.',
  TEAM_CHAT: 'Trò chuyện riêng giữa các thành viên được chọn trong lớp.',
};

export const GROUP_TYPE_ICONS ={ GENERAL: 'groups', STUDENT: 'school', PARENT: 'family_restroom', TEACHER_SCHOOL: 'co_present', TEAM_CHAT: 'forum' };

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
