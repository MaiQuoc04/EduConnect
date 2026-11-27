import { DEPARTMENT_REASON_TEXT, NAME_REASON_TEXT } from './utils/teacherValidation.js';

// Vietnamese UI text for API error codes. The server keeps its messages in English; the client shows these.
// Add a line here whenever a module introduces a new error code.
// Field names of the School Manager settings, for MSG_SCHOOL_SETTINGS_INVALID.
// "10A1, 10A2, 11B3" or "10A1, 10A2, 11B3 và 2 lớp khác" (FE-04 class size and period limits).
const shortList = (names, unit) =>
  names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} và ${names.length - 3} ${unit} khác`;
const trackText = (t) => (t.gradeLevel ? `${t.trackName} · khối ${t.gradeLevel}` : t.trackName);

const SCHOOL_SETTING_LABELS = {
  teacherMaxWeek: 'Số tiết giáo viên dạy tối đa / tuần',
  classMaxDay: 'Số tiết tối đa của lớp học / ngày',
  classMaxWeek: 'Số tiết tối đa của lớp học / tuần',
  subjectMaxWeek: 'Số tiết tối đa của một môn / tuần',
  warnStudents: 'Sĩ số khuyến nghị',
  maxStudents: 'Sĩ số tối đa',
  editDeadlineTime: 'Giờ cuối giáo viên bộ môn được sửa điểm danh',
};

const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Không kết nối được máy chủ. Vui lòng thử lại.',
  NETWORK_TIMEOUT: 'Máy chủ không phản hồi. Vui lòng thử lại.',
  SERVER_ERROR: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
  NOT_FOUND: 'Không tìm thấy dữ liệu.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  DUPLICATE: 'Giá trị này đã tồn tại.',
  AUTH_REQUIRED: 'Vui lòng đăng nhập.',
  AUTH_INVALID: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  PASSWORD_CHANGE_REQUIRED: 'Vui lòng đổi mật khẩu tạm thời trước khi tiếp tục.',
  ROLE_NOT_ASSIGNED: 'Bạn không có vai trò này.',
  MSG_REQUIRED: 'Vui lòng nhập đầy đủ thông tin bắt buộc.',
  // FE-01 Personal Account
  MSG_LOGIN_FAILED: 'Tên đăng nhập hoặc mật khẩu không đúng.',
  MSG_ACCOUNT_LOCKED: 'Tài khoản của bạn đã bị khoá. Vui lòng liên hệ nhà trường.',
  MSG_MAINTENANCE: 'Hệ thống đang bảo trì. Vui lòng quay lại sau.',
  MSG_TEMP_LOCKED: ({ minutesLeft } = {}) =>
    `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutesLeft ?? 'ít'} phút.`,
  MSG_INVALID_EMAIL: 'Email không hợp lệ.',
  MSG_OTP_FORMAT: 'Mã xác thực gồm 6 chữ số.',
  MSG_OTP_WRONG: ({ attemptsLeft } = {}) => `Mã xác thực không đúng. Bạn còn ${attemptsLeft} lần thử.`,
  MSG_OTP_TOO_MANY: 'Bạn đã nhập sai quá 5 lần. Vui lòng yêu cầu mã mới.',
  MSG_OTP_INVALID: 'Mã xác thực không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.',
  MSG_RESET_EXPIRED: 'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng thực hiện lại từ đầu.',
  MSG_ACCOUNT_NOT_MATCH: 'Thông tin tài khoản không khớp. Vui lòng kiểm tra lại tên đăng nhập và họ tên.',
  MSG_RESET_TOO_SOON: ({ minutesLeft } = {}) =>
    `Mật khẩu của tài khoản này vừa được đặt lại. Vui lòng thử lại sau ${minutesLeft ?? 'ít'} phút.`,
  MSG_REQUEST_PENDING: 'Bạn đã gửi yêu cầu trước đó. Vui lòng chờ nhà trường xử lý.',
  MSG_REASON_TOO_LONG: ({ max } = {}) => `Lý do không được vượt quá ${max ?? 500} ký tự.`,
  MSG_PASSWORD_RULES:'Mật khẩu mới chưa đáp ứng các yêu cầu bảo mật.',
  MSG_WRONG_CURRENT_PASSWORD: 'Mật khẩu hiện tại không đúng.',
  MSG_FILE_TOO_LARGE: ({ maxMb } = {}) => `Tệp vượt quá dung lượng cho phép (tối đa ${maxMb} MB).`,
  MSG_UPLOAD_FAILED: 'Không tải được tệp lên. Vui lòng thử lại.',
  MSG_INVALID_IMAGE: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.',
  // FE-04 Class & Group Management
  MSG_INVALID_DATE: 'Ngày không hợp lệ.',
  MSG_SCHOOL_YEAR_NAME_FORMAT: 'Tên năm học gồm hai năm liên tiếp, ví dụ 2027–2028.',
  MSG_SCHOOL_YEAR_NAME_TAKEN: 'Năm học này đã tồn tại.',
  MSG_SCHOOL_YEAR_DATES: 'Ngày bắt đầu phải trước ngày kết thúc.',
  MSG_SCHOOL_YEAR_DATES_NAME: 'Ngày bắt đầu phải thuộc năm đầu và ngày kết thúc thuộc năm sau của tên năm học.',
  MSG_SCHOOL_YEAR_OVERLAP: 'Khoảng thời gian này trùng với một năm học khác.',
  MSG_SCHOOL_YEAR_ENDED: 'Năm học đã kết thúc nên không thể chỉnh sửa.',
  MSG_SCHOOL_YEAR_SEMESTER_OUT_OF_RANGE: 'Các học kỳ đã tạo phải nằm trong khoảng thời gian của năm học.',
  MSG_SEMESTERS_EXIST: 'Năm học này đã có học kỳ.',
  MSG_SEMESTER_DATES: 'Ngày bắt đầu học kỳ phải trước ngày kết thúc.',
  MSG_SEMESTER_ORDER: 'Học kỳ 1 phải kết thúc trước khi học kỳ 2 bắt đầu.',
  MSG_SEMESTER_OUT_OF_YEAR: 'Học kỳ phải nằm trong khoảng thời gian của năm học.',
  MSG_SEMESTER_CLOSED: 'Học kỳ đã đóng.',
  MSG_SEMESTER_NOT_ENDED: 'Chỉ đóng được học kỳ sau ngày kết thúc.',
  MSG_SEMESTER_NOT_CLOSED: 'Học kỳ đang mở.',
  MSG_SUBJECT_CODE_FORMAT: 'Mã môn gồm 2 đến 20 ký tự: chữ in hoa không dấu, chữ số hoặc dấu gạch dưới.',
  MSG_SUBJECT_CODE_TAKEN: 'Mã môn này đã được sử dụng.',
  MSG_SUBJECT_CODE_LOCKED: 'Môn đã được sử dụng nên không đổi được mã.',
  MSG_SUBJECT_NAME_TAKEN: 'Đã có môn học cùng tên.',
  MSG_SUBJECT_NAME_LENGTH: 'Tên môn học tối đa 150 ký tự.',
  MSG_TRACK_NAME_TAKEN: 'Khối này đã có loại lớp cùng tên.',
  MSG_TRACK_GRADE_REQUIRED: 'Vui lòng chọn ít nhất một khối.',
  MSG_TRACK_NAME_SCOPE: 'Tên này đang dùng cho loại lớp “mọi khối” hoặc loại lớp theo khối, không dùng được cho cả hai.',
  MSG_TRACK_NAME_LENGTH: 'Tên loại lớp tối đa 100 ký tự.',
  MSG_TRACK_GRADE_DUPLICATE: 'Một khối bị chọn hai lần.',
  MSG_TRACK_GRADE: 'Loại lớp này dành cho khối khác.',
  MSG_TRACK_GRADE_IN_USE: 'Đang có lớp thuộc khối khác dùng loại lớp này nên không đổi khối được.',
  MSG_TRACK_DESCRIPTION_LENGTH: 'Mô tả tối đa 255 ký tự.',
  MSG_TRACK_IN_USE: 'Đang có lớp thuộc loại này nên không xoá được.',
  // Period limits are School Manager settings (27/11/2026): the numbers come from details.
  MSG_TRACK_PERIODS_RANGE: ({ max } = {}) => `Số tiết mỗi tuần của một môn là số nguyên từ 1 đến ${max ?? 10}.`,
  MSG_TRACK_PERIODS_TOTAL: ({ total, max } = {}) =>
    `Tổng số tiết là ${total}, vượt giới hạn ${max} tiết mỗi tuần của một lớp. Hãy giảm số tiết hoặc bỏ bớt môn.`,
  MSG_TRACK_COPY_OVER_LIMIT: ({ subjects = [], tracks = [] } = {}) => {
    const names = [...new Set([...tracks, ...subjects].map(trackText))];
    return `Chưa sao chép: ${names.length} loại lớp của năm nguồn vượt giới hạn số tiết trong Cài đặt hệ thống (${shortList(names, 'loại lớp')}). Hãy sửa năm nguồn hoặc cài đặt rồi thử lại.`;
  },
  MSG_TRACK_SUBJECT_DUPLICATE: 'Một môn học bị chọn hai lần.',
  MSG_TRACK_WEIGHTS_LOCKED: 'Năm học đã có điểm nên không thể thêm hoặc bỏ môn.',
  MSG_TRACK_CONFIG_EXISTS: 'Năm học này đã có thiết lập môn cho các loại lớp.',
  MSG_TRACK_COPY_SAME_YEAR: 'Vui lòng chọn hai năm học khác nhau.',
  MSG_TRACK_COPY_EMPTY: 'Năm học nguồn chưa có thiết lập để sao chép.',
  MSG_IMPORT_FILE_TYPE: 'Vui lòng chọn tệp Excel (.xlsx).',
  MSG_IMPORT_HEADER: ({ missing } = {}) =>
    `Tệp thiếu cột${missing?.length ? `: ${missing.join(', ')}` : ''}. Vui lòng dùng file mẫu.`,
  MSG_IMPORT_INVALID: 'Tệp còn lỗi nên chưa nhập dòng nào. Vui lòng sửa các dòng được liệt kê.',
  MSG_CLASS_IMPORT_CONFLICT: 'Danh sách lớp vừa thay đổi. Vui lòng kiểm tra lại tệp.',
  MSG_CLASS_NAME_TAKEN: 'Lớp này đã có trong năm học.',
  MSG_CLASS_NAME_FORMAT: 'Tên lớp gồm khối viết liền với chữ hoặc số, không dấu, ví dụ 10A1.',
  MSG_CLASS_NAME_GRADE: 'Tên lớp phải bắt đầu bằng khối của lớp.',
  MSG_GROUP_NOT_FOUND: 'Không tìm thấy nhóm hoặc bạn không thuộc nhóm này.',
  MSG_GROUP_READ_ONLY: 'Năm học đã kết thúc nên nhóm chỉ còn để xem.',
  MSG_GROUP_MEMBER_EXISTS: 'Có người đã ở trong nhóm. Vui lòng tải lại danh sách.',
  MSG_GROUP_MEMBER_NOT_ELIGIBLE: 'Có người không thuộc lớp hoặc không phù hợp với nhóm này.',
  MSG_GROUP_MEMBER_DUPLICATE: 'Một người bị chọn hai lần.',
  MSG_GROUP_MEMBER_NOT_FOUND: 'Người này không còn trong nhóm.',
  MSG_GROUP_MEMBER_HOMEROOM: 'Không thể xoá giáo viên chủ nhiệm khỏi nhóm của lớp.',
  MSG_GROUP_MEMBER_TEACHER: 'Chỉ quản lý trường mới xoá được giáo viên khỏi nhóm.',
  MSG_GROUP_MEMBER_CLASS_FIXED: 'Thành viên của nhóm lớp đi theo lớp nên không xoá được.',
  MSG_TEAM_REMOVE_SELF: 'Trưởng nhóm không tự xoá mình được. Hãy dùng Rời nhóm.',
  MSG_NICKNAME_TOO_LONG: ({ max } = {}) => `Biệt danh tối đa ${max ?? 50} ký tự.`,
  MSG_NICKNAME_INVALID: 'Biệt danh chỉ gồm chữ trên một dòng.',
  MSG_NICKNAME_NOT_STUDENT: 'Chỉ đặt biệt danh cho học sinh đang học trong lớp.',
  MSG_GROUP_CANNOT_LEAVE: 'Không thể rời nhóm chung, nhóm học sinh hay nhóm phụ huynh của lớp. Chỉ có thể rời team.',
  MSG_TEAM_LEADER_MUST_TRANSFER: 'Bạn là trưởng nhóm. Vui lòng chọn trưởng nhóm mới trước khi rời nhóm.',
  MSG_TEAM_LEADER_INVALID: 'Người được chọn không còn trong nhóm. Vui lòng chọn người khác.',
  MSG_TEAM_NOT_LEADER: 'Chỉ trưởng nhóm mới làm được việc này.',
  MSG_SYSTEM_MESSAGE: 'Không thể thao tác với dòng thông báo của nhóm.',
  MSG_TEAM_NAME_REQUIRED: 'Vui lòng nhập tên team.',
  MSG_TEAM_NAME_LENGTH: ({ min, max } = {}) => `Tên team gồm ${min ?? 2}–${max ?? 100} ký tự, trên một dòng.`,
  MSG_TEAM_TOO_FEW: ({ min } = {}) => `Vui lòng chọn ít nhất ${min ?? 2} người khác cho team.`,
  MSG_TEAM_TOO_MANY: ({ max } = {}) => `Một team có tối đa ${max ?? 50} thành viên.`,
  MSG_TEAM_CLASS_NOT_ALLOWED: 'Bạn chỉ tạo được team trong lớp của mình.',
  MSG_TEAM_MEMBER_NOT_ELIGIBLE: 'Có người không thuộc lớp hoặc nhóm này, hoặc tài khoản đang bị khoá.',
  MSG_TEAM_SCHOOL_NOT_ALLOWED: 'Chỉ giáo viên trong nhóm giáo viên toàn trường mới tạo được team giáo viên.',
  // FE-05 Group Feed
  MSG_FEED_NOT_FOUND: 'Nhóm này không có bảng tin hoặc bạn không xem được bảng tin của nhóm.',
  MSG_POST_NOT_FOUND: 'Không tìm thấy bài viết. Bài có thể đã bị xoá hoặc không còn hiển thị với bạn.',
  MSG_POST_NOT_INTERACTIVE: 'Chỉ thích và bình luận được bài đã duyệt và đang hiển thị.',
  MSG_POST_NOT_PENDING: 'Bài viết không còn chờ duyệt. Vui lòng tải lại.',
  MSG_POST_NOT_APPROVED: 'Chỉ ẩn được bài đã duyệt.',
  MSG_PIN_LIMIT: ({ max } = {}) =>
    `Đã đạt giới hạn ${max ?? 3} bài ghim. Vui lòng bỏ ghim bài cũ trước khi ghim bài mới.`,
  MSG_TEXT_TOO_LONG: ({ max } = {}) => `Nội dung tối đa ${(max ?? 5000).toLocaleString('vi-VN')} ký tự.`,
  MSG_COMMENT_NOT_FOUND: 'Không tìm thấy bình luận.',
  MSG_TOO_MANY_ATTACHMENTS: ({ max } = {}) => `Mỗi bài viết có tối đa ${max ?? 10} tệp đính kèm.`,
  // FE-06 Messaging
  MSG_CHAT_NO_ACCESS: 'Quản lý trường không xem tin nhắn của nhóm lớp.',
  MSG_CHAT_NOT_MEMBER: 'Bạn không còn là thành viên của cuộc trò chuyện này.',
  MSG_CHAT_CANNOT_HIDE: 'Chỉ ẩn được tin nhắn riêng và team, không ẩn được nhóm mặc định của lớp.', // UC-132
  MSG_CHAT_HIDE_UNAVAILABLE: 'Chức năng ẩn cuộc trò chuyện chưa sẵn sàng. Vui lòng thử lại sau.', // UC-132 (DB patch not run)
  MSG_MESSAGE_EMPTY: 'Vui lòng nhập nội dung tin nhắn.',
  MSG_MESSAGE_TOO_LONG: ({ max } = {}) => `Tin nhắn có tối đa ${max ?? 2000} ký tự.`,
  MSG_INVALID_INPUT: 'Dữ liệu gửi lên không hợp lệ.',
  MSG_MESSAGE_NOT_FOUND: 'Không tìm thấy tin nhắn này.',
  MSG_MESSAGE_DELETED: 'Tin nhắn này đã được xoá.',
  MSG_REPLY_INVALID: 'Không thể trả lời tin nhắn này nữa.',
  MSG_REACTION_INVALID: 'Cảm xúc này không có sẵn.',
  MSG_DELETE_SCOPE_INVALID: 'Vui lòng chọn cách xoá tin nhắn.',
  MSG_DELETE_NOT_OWNER: 'Bạn chỉ xoá ở phía mọi người được với tin nhắn của mình.',
  MSG_DELETE_EXPIRED: 'Đã quá thời hạn nên chỉ xoá được tin nhắn ở phía bạn.',
  MSG_DIRECT_SELF: 'Bạn không thể nhắn tin cho chính mình.',
  MSG_DIRECT_NOT_ALLOWED: 'Bạn chỉ nhắn tin riêng được với người trong lớp của mình.',
  MSG_DIRECT_LOCKED: 'Tài khoản này đã bị khoá nên không nhận được tin nhắn.',
  MSG_DIRECT_OUT_OF_SCOPE: 'Bạn không còn nhắn tin được với người này.',
  MSG_CLASS_STUDENT_DUPLICATE: 'Một học sinh bị chọn hai lần.',
  // Class size settings (27/11/2026): hard cap (MSG_CLASS_FULL) and recommended size (MSG_CLASS_OVER_WARNING, the
  // screens ask for a confirmation instead of showing it as an error).
  MSG_CLASS_FULL: ({ max, current, className } = {}) =>
    `${className ? `Lớp ${className}: m` : 'M'}ột lớp có tối đa ${max ?? 55} học sinh${current ? `; lớp đang có ${current} học sinh` : ''}.`,
  MSG_CLASS_OVER_WARNING: ({ warn, classes = [] } = {}) =>
    `${classes.map((c) => `Lớp ${c.className} sẽ có ${c.after} học sinh`).join('; ')}, vượt sĩ số khuyến nghị ${warn}.`,
  MSG_PASTE_TOO_MANY: ({ max } = {}) => `Mỗi lần dán tối đa ${max ?? 200} mã học sinh.`,
  MSG_STUDENT_LEFT_CLASS: 'Có học sinh đã chuyển đi hoặc thôi học ở lớp này nên không thêm lại được.',
  MSG_STUDENT_PREVIOUS_YEAR: ({ students } = {}) =>
    `${students?.length ? `${students.join(', ')}: ` : 'Có học sinh '}đã học ở năm học trước. Hãy xếp lớp bằng chức năng Lên lớp.`,
  MSG_STUDENT_ALREADY_ENROLLED: ({ classes } = {}) =>
    `Có học sinh đang học lớp khác trong năm học${classes?.length ? ` (${classes.join(', ')})` : ''}.`,
  // FE-02 Student Management (UC-07..UC-14)
  MSG_STUDENT_NOT_FOUND: 'Không tìm thấy học sinh.',
  MSG_CLASS_NOT_FOUND: 'Không tìm thấy lớp học.',
  MSG_SCHOOL_YEAR_NOT_FOUND: 'Không tìm thấy năm học.',
  MSG_TRANSFER_SAME_CLASS: 'Học sinh đang học ở lớp này. Vui lòng chọn lớp khác.',
  MSG_TRANSFER_DIFFERENT_YEAR: 'Lớp đích thuộc năm học khác. Vui lòng dùng chức năng lên lớp.',
  MSG_TRANSFER_DIFFERENT_GRADE_LEVEL: ({ currentGradeLevel, targetGradeLevel } = {}) =>
    currentGradeLevel && targetGradeLevel
      ? `Chỉ chuyển lớp trong cùng khối. Lớp đích thuộc khối ${targetGradeLevel}, học sinh đang học khối ${currentGradeLevel}; vui lòng dùng chức năng lên lớp.`
      : 'Chỉ chuyển lớp trong cùng khối. Lớp đích thuộc khối khác, vui lòng dùng chức năng lên lớp.',
  MSG_NO_ACTIVE_ENROLLMENT: 'Học sinh hiện không học ở lớp nào trong năm học này.',
  MSG_SAME_SCHOOL_YEAR: 'Năm học đích phải khác năm học nguồn. Chuyển lớp trong cùng năm thì dùng chức năng chuyển lớp.',
  MSG_INVALID_YEAR_ORDER: 'Năm học đích phải bắt đầu sau năm học nguồn.',
  MSG_NOT_NEXT_SCHOOL_YEAR: 'Chỉ lên lớp từ năm học liền trước sang năm học đích.',
  MSG_DUPLICATE_STUDENT_IN_REQUEST: 'Có học sinh được chọn nhiều lần. Mỗi học sinh chỉ thuộc một lớp đích.',
  MSG_TOO_MANY_STUDENTS: ({ max } = {}) => `Mỗi lần chỉ xử lý tối đa ${max ?? 200} học sinh.`,
  SKIP_NO_ACTIVE_ENROLLMENT: 'Học sinh không còn theo học lớp nào trong năm học nguồn.',
  SKIP_ALREADY_ENROLLED: 'Học sinh đã được xếp lớp trong năm học đích.',
  SKIP_STUDENT_NOT_FOUND: 'Không tìm thấy học sinh.',
  SKIP_CLASS_ENROLLMENT_EXISTS: 'Học sinh đã từng học ở lớp này.',
  SKIP_GRADE_NOT_ALLOWED: ({ fromGradeLevel, toGradeLevel } = {}) =>
    fromGradeLevel && toGradeLevel
      ? `Học sinh đang học khối ${fromGradeLevel}, chỉ lên khối kế tiếp hoặc ở lại khối ${fromGradeLevel}, không vào khối ${toGradeLevel}.`
      : 'Lớp đích không phải khối kế tiếp hay cùng khối của học sinh.',
  MSG_PARENT_NOT_FOUND: 'Không tìm thấy phụ huynh.',
  MSG_USER_NOT_PARENT: 'Tài khoản này không phải tài khoản phụ huynh.',
  MSG_LINK_ALREADY_EXISTS: 'Phụ huynh này đã được liên kết với học sinh.',
  MSG_MAX_PARENTS_REACHED: ({ max } = {}) => `Học sinh đã có đủ ${max ?? 2} phụ huynh. Vui lòng gỡ liên kết trước khi thêm.`,
  MSG_LINK_NOT_FOUND: 'Liên kết này không tồn tại.',
  MSG_INVALID_RELATIONSHIP_TYPE: 'Quan hệ phải là Bố, Mẹ hoặc Người giám hộ.',
  MSG_PARENT_PHONE_NOT_FOUND: 'Không có tài khoản phụ huynh nào với số điện thoại này.',
  MSG_DUPLICATE_LINK_IN_FILE: ({ duplicateOf } = {}) =>
    duplicateOf
      ? `Học sinh và phụ huynh này đã có ở dòng ${duplicateOf} trong file.`
      : 'Học sinh và phụ huynh này đã có ở một dòng phía trên trong file.',
  // FE-03 Teacher Management
  TEACHER_NOT_FOUND: 'Không tìm thấy giáo viên này.',
  INVALID_DATE: 'Ngày không hợp lệ.',
  MSG_FIELD_TOO_LONG: ({ field, max } = {}) =>
    `${{ fullName: 'Họ và tên', department: 'Tên tổ', search: 'Từ khoá tìm kiếm', subject: 'Tên môn' }[field] ?? 'Nội dung'} quá dài (tối đa ${max ?? ''} ký tự).`,
  MSG_SUBJECT_INVALID: 'Có môn học không còn tồn tại. Vui lòng tải lại trang.',
  MSG_SUBJECT_IN_USE: ({ subjects = [] } = {}) =>
    `Không thể bỏ ${subjects.map((s) => `môn ${s.name} (đang dạy ${s.classes.join(', ')})`).join('; ')}. ` +
    'Hãy phân công lại giảng dạy trước.',
  MSG_INVALID_INPUT: 'Dữ liệu gửi lên không hợp lệ. Vui lòng tải lại trang.',
  MSG_TOO_MANY: ({ field, max } = {}) =>
    field === 'subjectIds'
      ? `Chỉ chọn tối đa ${max} môn.`
      : max && !field
        ? `Danh sách quá dài để xuất (tối đa ${max} giáo viên). Hãy lọc bớt rồi xuất lại.`
        : 'Quá nhiều thay đổi trong một lần lưu.',
  MSG_INVALID_NAME: ({ reason } = {}) => NAME_REASON_TEXT[reason] ?? 'Họ và tên không hợp lệ.',
  MSG_INVALID_DEPARTMENT: ({ reason } = {}) => DEPARTMENT_REASON_TEXT[reason] ?? 'Tên tổ chuyên môn không hợp lệ.',
  MSG_DEPARTMENT_INVALID: 'Tổ chuyên môn không còn trong danh sách. Vui lòng tải lại trang và chọn lại.',
  MSG_DEPARTMENTS_NOT_READY:
    'Danh sách tổ chuyên môn chưa được tạo đủ trong cơ sở dữ liệu (cần chạy database/patch_v0.3_departments.sql và patch_v0.3_department_subjects.sql).',
  // FE-10 timetable (UC-70..UC-75)
  MSG_TIMETABLES_NOT_READY: 'Bảng thời khoá biểu chưa được tạo trong cơ sở dữ liệu (cần chạy database/patch_v0.3_timetables.sql).',
  MSG_TIMETABLE_STALE: 'Thời khoá biểu lớp này vừa được người khác thay đổi. Vui lòng tải lại trước khi lưu.',
  MSG_TIMETABLE_RANGE: ({ min, max } = {}) =>
    `Thời khoá biểu phải áp dụng từ ${formatVnDate(min)} trở đi và kết thúc trước ${formatVnDate(max)} (không sửa các ngày đã qua).`,
  MSG_TIMETABLE_ENTRY_INVALID: ({ field } = {}) =>
    field === 'weekday' ? 'Chỉ xếp tiết từ thứ Hai đến thứ Bảy.' : field === 'room' ? 'Tên phòng tối đa 50 ký tự.' : 'Có ô thời khoá biểu không hợp lệ. Vui lòng tải lại trang.',
  MSG_TIMETABLE_DUPLICATE_PERIOD: 'Một tiết chỉ xếp được một môn.',
  MSG_TIMETABLE_SUBJECT_NOT_IN_CLASS: ({ subjects = [] } = {}) => `Môn ${subjects.join(', ')} không thuộc loại lớp này.`,
  MSG_TIMETABLE_NO_TEACHER: ({ className } = {}) =>
    `Một số môn${className ? ` của lớp ${className}` : ''} chưa có giáo viên được phân công trong khoảng ngày này. Hãy phân công giảng dạy trước.`,
  MSG_TIMETABLE_TEACHER_CLASH: ({ className } = {}) =>
    `Trùng giờ: giáo viên đã có tiết ở lớp khác cùng giờ${className ? ` (khi xếp lớp ${className})` : ''}.`,
  MSG_TIMETABLE_OVER_QUOTA: ({ className, items = [] } = {}) =>
    `Vượt số tiết quy định${className ? ` ở lớp ${className}` : ''}: ${items.map((i) => `${i.subject} ${i.periods} / ${i.periodsPerWeek} tiết`).join('; ')}. Hãy bớt tiết rồi lưu lại.`,
  MSG_TIMETABLE_CLASS_LIMIT: ({ className, days = [], maxDay, periods, maxWeek } = {}) => {
    const parts = days.map((d) => `${['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'][d.weekday - 1]} ${d.periods} tiết`);
    const day = parts.length ? `quá ${maxDay} tiết/ngày (${parts.join(', ')})` : '';
    const week = periods > maxWeek ? `quá ${maxWeek} tiết/tuần (đang có ${periods} tiết)` : '';
    return `Thời khoá biểu${className ? ` lớp ${className}` : ''} ${[day, week].filter(Boolean).join(' và ')}. Giới hạn đặt ở Cài đặt hệ thống.`;
  },
  MSG_TIMETABLE_IMPORT_HAS_ERRORS: 'File còn lỗi nên chưa lưu lớp nào. Hãy sửa theo kết quả kiểm tra rồi nhập lại.',
  // FE-10 school calendar (Lịch của trường)
  MSG_SCHOOL_EVENT_NOT_FOUND: 'Không tìm thấy sự kiện này. Sự kiện có thể đã bị xoá.',
  MSG_SCHOOL_EVENT_TITLE: ({ reason, max } = {}) => (reason === 'TOO_LONG' ? `Tên sự kiện tối đa ${max} ký tự.` : 'Vui lòng nhập tên sự kiện.'),
  MSG_SCHOOL_EVENT_LOCATION: ({ max } = {}) => `Địa điểm tối đa ${max} ký tự.`,
  MSG_SCHOOL_EVENT_DESCRIPTION: ({ max } = {}) => `Ghi chú tối đa ${max} ký tự.`,
  MSG_SCHOOL_EVENT_TIME: ({ reason, min, max } = {}) =>
    reason === 'PAST' ? 'Thời gian bắt đầu phải sau thời điểm hiện tại.'
      : reason === 'END_BEFORE_START' ? 'Thời gian kết thúc phải sau thời gian bắt đầu.'
        : reason === 'NO_YEAR' ? 'Ngày này không thuộc năm học nào. Hãy tạo năm học trước.'
          : `Sự kiện phải kết thúc trong năm học (${formatVnDate(min)} – ${formatVnDate(max)}).`,
  MSG_SCHOOL_EVENT_GRADE: 'Khối lớp không hợp lệ. Vui lòng tải lại trang.',
  MSG_SCHOOL_EVENT_DUPLICATE: 'Ngày này đã có sự kiện cùng tên cho cùng đối tượng. Hãy kiểm tra lại lịch.',
  MSG_SCHOOL_EVENT_CHANGED: 'Sự kiện vừa được sửa ở nơi khác sau khi bạn mở. Hãy tải lại rồi sửa tiếp.',
  MSG_SCHOOL_EVENTS_NOT_READY: 'Lịch của trường chưa sẵn sàng: cơ sở dữ liệu cần chạy patch_v0.3_school_events.sql.',
  // FE-10 automatic scheduling
  MSG_AUTO_INVALID: ({ field, reason, min, max } = {}) =>
    reason === 'RANGE' ? `Giá trị “${field}” phải từ ${min} đến ${max}.`
      : field === 'classIds' && reason === 'REQUIRED' ? 'Hãy chọn ít nhất một lớp.'
        : field === 'classIds' ? 'Có lớp không thuộc năm học này. Vui lòng tải lại trang.'
          : field === 'grid' && reason === 'TOO_MANY_DAYS' ? `Một tuần học tối đa ${max} ngày.`
            : field === 'grid' && reason === 'EMPTY' ? 'Khung tuần chưa có tiết nào.'
              : field === 'grid' && reason === 'SUNDAY' ? 'Không xếp học vào Chủ nhật.'
                  : field === 'fixed' && reason === 'DUPLICATE_SLOT' ? 'Hai ô cố định trùng nhau.'
                    : 'Thiết lập xếp tự động không hợp lệ. Vui lòng kiểm tra lại.',
  MSG_SEMESTER_NOT_FOUND: 'Không tìm thấy học kỳ. Vui lòng tải lại trang.',
  MSG_SEMESTER_ENDED: 'Học kỳ này đã kết thúc, không còn gì để xếp.',
  MSG_AUTO_STALE: 'Phân công hoặc thời khoá biểu vừa thay đổi sau khi xếp. Hãy xếp lại với dữ liệu mới.',
  MSG_AUTO_CONFIRM: ({ classes = [] } = {}) => `Lớp ${classes.join(', ')} đã có thời khoá biểu hoặc phân công. Hãy xác nhận ghi đè.`,
  MSG_AUTO_DRAFT_INVALID: ({ problem, teacher, className, subject } = {}) =>
    `Bản nháp vi phạm quy tắc (${problem}${teacher ? ` – ${teacher}` : ''}${className ? ` – lớp ${className}` : ''}${subject ? ` – ${subject}` : ''}). Hãy xếp lại.`,
  MSG_AUTO_INCOMPLETE: ({ items = [] } = {}) => `Bản nháp còn thiếu: ${items.join('; ')}.`,
  // FE-10 period times (School Manager)
  MSG_PERIOD_TIMES_INVALID: ({ field, reason, min, max, earliest, gap, end } = {}) =>
    field === 'duration' ? `Thời lượng một tiết từ ${min} đến ${max} phút.`
      : reason === 'OVERLAP' ? `Buổi sau phải bắt đầu từ ${earliest} trở đi (nghỉ giữa hai buổi ít nhất ${gap} phút).`
        : reason === 'DAY' ? `Giờ học phải nằm trong ${min} – ${max} (đang kết thúc lúc ${end}).`
          : reason === 'COUNT' ? 'Số buổi học vừa thay đổi. Vui lòng tải lại trang.'
            : 'Giờ bắt đầu không hợp lệ (giờ:phút).',
  MSG_PERIOD_TIMES_CHANGED: 'Giờ học vừa được người khác thay đổi sau khi bạn mở trang. Hãy tải lại để xem giờ mới.',
  MSG_PERIOD_TIMES_EMPTY: 'Chưa có tiết học nào trong cơ sở dữ liệu.',
  // School Manager settings (Dung, 21/11/2026)
  MSG_SCHOOL_SETTINGS_INVALID: ({ field, reason, min, max } = {}) =>
    reason === 'ABOVE_DAYS' ? `Số tiết tối đa của lớp học / tuần không được lớn hơn ${max} (số tiết / ngày × 6 ngày).`
      : reason === 'ABOVE_CLASS_WEEK' ? `Số tiết tối đa của một môn không được lớn hơn số tiết tối đa của lớp học / tuần (${max}).`
      : reason === 'ABOVE_MAX_STUDENTS' ? `Sĩ số khuyến nghị không được lớn hơn sĩ số tối đa (${max}).`
      : reason === 'RANGE' ? `${SCHOOL_SETTING_LABELS[field] ?? 'Giá trị'} phải là số nguyên từ ${min} đến ${max}.`
        : reason === 'TIME' ? `${SCHOOL_SETTING_LABELS[field] ?? 'Giờ'} phải là giờ hợp lệ (HH:MM) từ ${min} đến ${max}.`
        : `Vui lòng nhập ${(SCHOOL_SETTING_LABELS[field] ?? 'đủ các giá trị').toLowerCase()}.`,
  MSG_SCHOOL_SETTINGS_CHANGED: 'Cài đặt vừa được người khác thay đổi sau khi bạn mở trang. Hãy tải lại để xem giá trị mới.',
  MSG_SCHOOL_SETTINGS_NOT_READY: 'Chưa lưu được cài đặt: cơ sở dữ liệu cần chạy patch_v0.3_school_settings.sql.',
  // FE-10 class calendar (UC-76..UC-80)
  MSG_CALENDAR_NOT_READY: 'Bảng lịch lớp chưa có trong cơ sở dữ liệu.',
  MSG_EVENT_RANGE: 'Chỉ xem được tối đa 62 ngày một lần.',
  MSG_EVENT_NOT_FOUND: 'Không tìm thấy sự kiện này hoặc bạn không thuộc người được xem.',
  MSG_EVENT_NOT_OWNER: 'Chỉ người tạo mới được sửa hoặc xoá sự kiện.',
  MSG_EVENT_STARTED: 'Sự kiện đã bắt đầu nên không sửa hoặc xoá được nữa.',
  MSG_EVENT_CLASS_NOT_ALLOWED: 'Bạn không chủ nhiệm hoặc giảng dạy lớp này.',
  MSG_EVENT_GENERAL_HOMEROOM_ONLY: 'Chỉ giáo viên chủ nhiệm được tạo sự kiện chung của lớp. Hãy chọn môn bạn dạy.',
  MSG_EVENT_SUBJECT_NOT_TAUGHT: 'Bạn không được phân công dạy môn này ở lớp này vào ngày diễn ra sự kiện.',
  MSG_EVENT_CATEGORY: 'Vui lòng chọn loại sự kiện.',
  MSG_EVENT_TITLE: ({ reason, max } = {}) => (reason === 'TOO_LONG' ? `Tiêu đề tối đa ${max ?? 255} ký tự.` : 'Vui lòng nhập tiêu đề sự kiện.'),
  MSG_EVENT_DESCRIPTION: ({ max } = {}) => `Mô tả tối đa ${max ?? 2000} ký tự.`,
  MSG_EVENT_TIME: ({ reason, min, max } = {}) =>
    reason === 'PAST' ? 'Thời gian bắt đầu phải sau thời điểm hiện tại.'
      : reason === 'END_BEFORE_START' ? 'Thời gian kết thúc phải sau thời gian bắt đầu.'
        : reason === 'END_OTHER_DAY' ? 'Sự kiện diễn ra trong một ngày; giờ kết thúc phải cùng ngày với giờ bắt đầu.'
          : `Sự kiện phải nằm trong năm học (${formatVnDate(min)} – ${formatVnDate(max)}).`,
  MSG_EVENT_CHANGED: 'Sự kiện vừa được lưu ở nơi khác sau khi bạn mở trang. Hãy tải lại để xem bản mới rồi sửa tiếp.',
  MSG_EVENT_VIEWERS: ({ reason, max } = {}) =>
    reason === 'TOO_MANY' ? `Chỉ chọn tối đa ${max ?? 100} người; hãy dùng các ô "Tất cả học sinh / phụ huynh / giáo viên".`
      : 'Có người được chọn không còn thuộc lớp này. Vui lòng tải lại danh sách.',
  // FE-07 Extracurricular (Dung)
  MSG_ACTIVITY_NOT_READY: 'Chức năng ngoại khoá chưa sẵn sàng: cơ sở dữ liệu cần chạy patch_v0.3_activity_title.sql.',
  MSG_ACTIVITY_NOT_FOUND: 'Không tìm thấy hoạt động. Hoạt động có thể đã bị ẩn hoặc bạn không thuộc lớp này.',
  MSG_ACTIVITY_NOT_HOMEROOM: 'Chỉ giáo viên chủ nhiệm hiện tại của lớp mới quản lý hoạt động ngoại khoá của lớp.',
  MSG_ACTIVITY_NO_FEED: 'Lớp chưa có bảng tin lớp nên chưa đăng được hoạt động.',
  MSG_ACTIVITY_TITLE: ({ reason, max } = {}) => (reason === 'TOO_LONG' ? `Tên hoạt động tối đa ${max} ký tự.` : 'Vui lòng nhập tên hoạt động.'),
  MSG_ACTIVITY_DESCRIPTION: ({ reason, max } = {}) => (reason === 'TOO_LONG' ? `Mô tả tối đa ${max} ký tự.` : 'Vui lòng nhập mô tả hoạt động.'),
  MSG_ACTIVITY_LOCATION: ({ reason, max } = {}) => (reason === 'TOO_LONG' ? `Địa điểm tối đa ${max} ký tự.` : 'Vui lòng nhập địa điểm tổ chức.'),
  MSG_ACTIVITY_TIME: ({ reason, min, max } = {}) =>
    ({
      START_PAST: 'Thời gian bắt đầu phải sau thời điểm hiện tại.',
      END_BEFORE_START: 'Thời gian kết thúc phải sau thời gian bắt đầu.',
      DEADLINE_PAST: 'Hạn đăng ký phải sau thời điểm hiện tại.',
      DEADLINE_AFTER_START: 'Hạn đăng ký không được sau giờ bắt đầu hoạt động.',
    })[reason] ?? `Hoạt động phải nằm trong năm học (${formatVnDate(min)} – ${formatVnDate(max)}).`,
  MSG_ACTIVITY_CAPACITY: ({ reason, max, registered } = {}) =>
    reason === 'BELOW_REGISTERED'
      ? `Đã có ${registered} học sinh đăng ký, chỉ tiêu không được nhỏ hơn.`
      : `Chỉ tiêu là số nguyên từ 1 đến ${max}, hoặc để trống nếu không giới hạn.`,
  MSG_ACTIVITY_CHANGED: 'Hoạt động vừa được lưu ở nơi khác sau khi bạn mở trang. Hãy tải lại để xem bản mới rồi sửa tiếp.',
  MSG_ACTIVITY_CANCELLED: 'Hoạt động đã bị huỷ.',
  MSG_ACTIVITY_STARTED: 'Hoạt động đã bắt đầu nên không thay đổi được nữa.',
  MSG_ACTIVITY_CLOSED: 'Đã hết hạn đăng ký nên không đăng ký hay huỷ đăng ký được nữa.',
  MSG_ACTIVITY_FULL: 'Hoạt động đã đủ chỉ tiêu.',
  MSG_ACTIVITY_ALREADY_REGISTERED: 'Con bạn đã được đăng ký hoạt động này.',
  MSG_ACTIVITY_NOT_REGISTERED: 'Con bạn chưa được đăng ký hoạt động này.',
  MSG_ACTIVITY_CHILD: 'Bạn chỉ đăng ký được cho con mình đang học lớp này.',
  MSG_ACTIVITY_EXPORT_TOO_MANY: ({ max } = {}) => `Danh sách quá dài để xuất (tối đa ${max} dòng).`,
  MSG_POST_IS_ACTIVITY: 'Bài này là hoạt động ngoại khoá: hãy sửa hoặc huỷ trong mục Ngoại khoá.',
  // UC-114 Manage Departments
  MSG_DEPARTMENT_NOT_FOUND: 'Tổ chuyên môn này không còn tồn tại. Vui lòng tải lại trang.',
  MSG_DEPARTMENT_NAME_INVALID: ({ reason } = {}) =>
    ({
      REQUIRED: 'Vui lòng nhập tên tổ chuyên môn.',
      TOO_SHORT: 'Tên tổ cần ít nhất 2 chữ cái hoặc chữ số.',
      TOO_LONG: 'Tên tổ tối đa 100 ký tự.',
      INVALID_CHAR: "Tên tổ chỉ gồm chữ, số, khoảng trắng và các dấu . , - – ( ) & / '.",
      NO_LETTER: 'Tên tổ phải có chữ cái.',
    })[reason] ?? 'Tên tổ chuyên môn không hợp lệ.',
  MSG_DEPARTMENT_NAME_TAKEN: ({ name } = {}) => `Đã có tổ “${name ?? ''}”. Tên tổ không được trùng (không phân biệt hoa thường và dấu).`,
  MSG_DEPARTMENT_IN_USE: ({ teachers } = {}) =>
    `Tổ còn ${teachers ?? 'một số'} giáo viên. Hãy chuyển các giáo viên này sang tổ khác trước khi xoá.`,
  MSG_SUBJECT_IN_OTHER_DEPARTMENT: ({ items = [] } = {}) =>
    `Môn ${items.map((i) => `${i.subject} (đang thuộc ${i.department})`).join(', ')} đã thuộc tổ khác. Hãy bỏ môn khỏi tổ đó trước.`,
  MSG_SUBJECT_NOT_IN_DEPARTMENT: ({ subjects = [], department } = {}) =>
    `Môn ${subjects.join(', ')} thuộc tổ khác nên không thêm được cho giáo viên ${department ? `của ${department}` : 'chưa thuộc tổ nào'}. ` +
    'Chỉ thêm được môn của tổ đã chọn hoặc môn chưa thuộc tổ nào.',
  MSG_LOGIN_IDENTIFIER_READONLY: 'Chỉ Quản trị hệ thống mới được đổi tên đăng nhập, email và số điện thoại.',
  MSG_UNKNOWN_FIELD: 'Dữ liệu gửi lên có trường không được phép. Vui lòng tải lại trang.',
  SCHOOL_YEAR_NOT_FOUND: 'Không tìm thấy năm học.',
  MSG_HOMEROOM_STALE: ({ classes = [] } = {}) =>
    `Lớp ${classes.join(', ')} vừa được người khác thay đổi. Hãy tải lại dữ liệu rồi phân công lại.`,
  MSG_TEACHER_LOCKED: ({ teachers = [] } = {}) =>
    `Không thể phân công ${teachers.join(', ')} làm chủ nhiệm vì tài khoản đã bị khoá.`,
  MSG_HOMEROOM_LIMIT: ({ max = 1, conflicts = [] } = {}) =>
    `Mỗi giáo viên chủ nhiệm tối đa ${max} lớp: ` +
    conflicts.map((c) => `${c.teacher} (${c.classes.join(', ')})`).join('; ') + '.',
  MSG_EFFECTIVE_DATE: ({ min, max } = {}) =>
    `Khoảng phân công phải bắt đầu từ ${formatVnDate(min)} trở đi và kết thúc trước ${formatVnDate(max)} (không sửa phân công trong quá khứ).`,
  MSG_SUBJECT_NOT_IN_CLASS: 'Lớp này không học môn đã chọn trong năm học.',
  MSG_ASSIGNMENT_STALE: ({ cells = [] } = {}) =>
    `Ô ${cells.join(', ')} vừa được người khác thay đổi. Hãy tải lại dữ liệu rồi phân công lại.`,
  MSG_TEACHER_NOT_QUALIFIED: ({ items = [] } = {}) =>
    `Giáo viên chưa đăng ký dạy môn: ${items.map((i) => `${i.teacher} (${i.cell})`).join('; ')}.`,
  MSG_ASSIGNMENT_IN_TIMETABLE: ({ items = [] } = {}) =>
    `Không thể bỏ trống ${items.map((i) => `${i.cell} (còn ${i.periods} tiết trên thời khoá biểu)`).join('; ')}. ` +
    'Hãy chọn giáo viên khác hoặc sửa thời khoá biểu trước.',
  MSG_TIMETABLE_CLASH: ({ items = [] } = {}) =>
    'Trùng lịch dạy: ' +
    items
      .map((i) => `${i.cell} – giáo viên mới đã dạy ${i.items.map((x) => `${x.otherClass} tiết ${x.period} ngày ${formatVnDate(x.date)}`).join(', ')}`)
      .join('; ') +
    '.',
  MSG_TEACHER_OVER_WEEK_LIMIT: ({ items = [] } = {}) =>
    `Vượt số tiết giáo viên dạy tối đa: ${items.map((i) => `${i.teacher} sẽ dạy ${i.load} tiết/tuần (tối đa ${i.max})`).join('; ')}. ` +
    'Hãy chọn giáo viên khác hoặc đổi giới hạn ở Cài đặt hệ thống.',
  MSG_OCCUPATION_TOO_LONG: ({ max } = {}) => `Nghề nghiệp không được vượt quá ${max ?? 100} ký tự.`,
  MSG_ADDRESS_TOO_LONG: ({ max } = {}) => `Địa chỉ không được vượt quá ${max ?? 500} ký tự.`,
  // FE-13 System Administration
  MSG_ACCOUNT_INVALID: 'Vui lòng kiểm tra lại các thông tin được đánh dấu.',
  MSG_NOTHING_CHANGED: 'Bạn chưa thay đổi thông tin nào.',
  MSG_CANNOT_LOCK_SELF: 'Bạn không thể tự khoá tài khoản của mình.',
  MSG_ACCOUNT_STATE: 'Trạng thái tài khoản vừa thay đổi. Vui lòng tải lại trang.',
  MSG_SETTINGS_INVALID: 'Một số giá trị chưa hợp lệ. Vui lòng kiểm tra các ô được đánh dấu.',
  MSG_MAINTENANCE_INVALID: 'Vui lòng kiểm tra lại các thông tin được đánh dấu.',
  MSG_MAINTENANCE_STATE: 'Trạng thái đợt bảo trì vừa thay đổi. Vui lòng tải lại trang.',
  MSG_IMPORT_TYPE: 'Vui lòng chọn loại tài khoản của file.',
  MSG_IMPORT_FILE: 'Chỉ nhập được file .xlsx hoặc .csv tạo từ file mẫu.',
  MSG_IMPORT_TEMPLATE: ({ missing } = {}) =>
    `File không đúng mẫu: thiếu cột ${(missing ?? []).join(', ')}. Vui lòng tải file mẫu và điền lại.`,
  MSG_IMPORT_EMPTY: 'File chưa có dòng dữ liệu nào.',
  // Shared by FE-13 account import (details.max) and FE-04 class import (details.maxRows).
  MSG_IMPORT_TOO_MANY_ROWS: ({ max, maxRows } = {}) => `Mỗi file chỉ được tối đa ${max ?? maxRows ?? 2000} dòng. Vui lòng chia nhỏ file.`,
  MSG_IMPORT_NO_VALID_ROWS: 'File không có dòng hợp lệ nào để nhập.',
  MSG_IMPORT_CONFLICT: 'Dữ liệu vừa thay đổi trong lúc nhập nên chưa có tài khoản nào được lưu. Kết quả kiểm tra đã được cập nhật, vui lòng xem lại.',
  // FE-11 Grade Management
  MSG_SEMESTER_NOT_FOUND: 'Không tìm thấy học kỳ.',
  MSG_SUBJECT_NOT_FOUND: 'Không tìm thấy môn học.',
  MSG_SEMESTER_CLASS_MISMATCH: 'Học kỳ này không thuộc năm học của lớp.',
  MSG_YEAR_ENDED: 'Năm học đã kết thúc, không thể thay đổi.',
  MSG_STRUCTURE_INVALID: 'Một số thành phần điểm chưa hợp lệ. Vui lòng kiểm tra lại.',
  MSG_STRUCTURE_LOCKED: 'Cấu trúc điểm này đã có điểm nên không thể sửa.',
  MSG_STRUCTURE_EMPTY: 'Môn này chưa có cấu trúc điểm.',
  MSG_STRUCTURE_TYPE_MISMATCH: ({ semesterNo, assessmentType } = {}) =>
    `Học kỳ ${semesterNo ?? 'khác'} của môn này đang ${assessmentType === 'COMMENT' ? 'đánh giá bằng nhận xét' : 'chấm điểm số'}. Các học kỳ trong một năm học phải cùng một cách đánh giá.`,
  MSG_COPY_SAME: 'Hãy chọn học kỳ, khối hoặc môn khác với bản gốc.',
  MSG_COPY_TARGETS: 'Hãy chọn ít nhất một môn để sao chép sang (tối đa 50 môn).',
  MSG_GRADES_NOT_ASSIGNED: 'Bạn không được phân công dạy môn này ở lớp này.',
  MSG_GRADES_FINALIZED: 'Sổ điểm đã chốt. Hãy đề nghị quản lý nhà trường mở khoá.',
  MSG_GRADES_NOT_FINALIZED: 'Sổ điểm này chưa được chốt.',
  MSG_GRADES_NO_CHANGE: 'Không có điểm nào thay đổi.',
  MSG_GRADES_TOO_MANY: 'Quá nhiều thay đổi trong một lần lưu.',
  MSG_GRADES_CELL_INVALID: 'Có ô điểm không thuộc sổ điểm này. Vui lòng tải lại trang.',
  MSG_GRADES_STUDENT_LEFT: 'Học sinh đã rời lớp, điểm chỉ được xem.',
  MSG_SCORE_INVALID: 'Điểm phải từ 0 đến 10, tối đa 2 chữ số thập phân.',
  MSG_RESULT_INVALID: 'Kết quả phải là Đ (Đạt) hoặc CĐ (Chưa đạt).',
  MSG_GRADES_INCOMPLETE: ({ count } = {}) => `Chưa chốt được: ${count ?? 'một số'} học sinh đang học còn thiếu điểm.`,
  MSG_IMPORT_HAS_ERRORS: 'File còn dòng bị lỗi. Sửa file rồi thử lại; chưa có điểm nào được lưu.',
  // FE-09 Notifications
  MSG_NOTIFICATION_NOT_FOUND: 'Không tìm thấy thông báo.',
  MSG_INVALID_PARAM: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.',
  // FE-12 Attendance Management
  MSG_LESSON_NOT_FOUND: 'Không tìm thấy tiết học.',
  MSG_ATTENDANCE_NOT_STARTED: 'Tiết học chưa bắt đầu nên chưa điểm danh được.',
  MSG_ATTENDANCE_DEADLINE_PASSED: 'Đã quá hạn điểm danh của tiết này. Cần sửa thì liên hệ quản lý nhà trường.',
  MSG_ATTENDANCE_VIEW_ONLY: 'Bạn chỉ xem được điểm danh của tiết này.',
  MSG_ATTENDANCE_HOMEROOM_ONLY: 'Giáo viên chủ nhiệm chỉ đổi được giữa vắng có phép và vắng không phép.',
  MSG_ATTENDANCE_REASON_REQUIRED: 'Vui lòng ghi lý do thay đổi.',
  MSG_ATTENDANCE_INCOMPLETE: ({ missing } = {}) => `Còn ${missing ?? 'một số'} học sinh chưa có trạng thái. Vui lòng điểm danh cả lớp.`,
  MSG_ATTENDANCE_NOT_IN_CLASS: 'Có học sinh không thuộc danh sách của tiết này. Vui lòng tải lại trang.',
  MSG_ATTENDANCE_RECORDS: 'Dữ liệu điểm danh không hợp lệ. Vui lòng tải lại trang.',
  MSG_ATTENDANCE_STATUS: 'Trạng thái điểm danh không hợp lệ.',
  MSG_ATTENDANCE_NOTE_TOO_LONG: ({ max } = {}) => `Ghi chú tối đa ${max ?? 500} ký tự.`,
  MSG_ATTENDANCE_RANGE: 'Khoảng ngày phải nằm trong học kỳ, ngày bắt đầu trước ngày kết thúc.',
};

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' (kept local so messages.js has no imports)
function formatVnDate(v) {
  if (!v) return '';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : String(v);
}

export function errorText({ code, message, details } = {}) {
  const entry = ERROR_MESSAGES[code];
  if (typeof entry === 'function') return entry(details);
  return entry ?? message ?? ERROR_MESSAGES.SERVER_ERROR;
}

export const ROLE_LABELS = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  SCHOOL_MANAGER: 'Quản lý nhà trường',
  TEACHER: 'Giáo viên',
  STUDENT: 'Học sinh',
  PARENT: 'Phụ huynh',
};

export const GENDER_LABELS = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
export const RELATIONSHIP_LABELS = { FATHER: 'Bố', MOTHER: 'Mẹ', GUARDIAN: 'Người giám hộ' };

// UC-27 import: one message per row problem (server sends { row, code, value }).
const IMPORT_ROW_MESSAGES = {
  ROW_REQUIRED: () => 'Thiếu thông tin ở một hoặc nhiều cột.',
  ROW_GRADE_INVALID: (v) => `Khối “${v}” không hợp lệ, chỉ nhận 10, 11 hoặc 12.`,
  ROW_TRACK_NOT_FOUND: (v) => `Không có loại lớp “${v}”.`,
  ROW_TRACK_GRADE: (v) => `Loại lớp “${v}” không dùng cho khối ở dòng này.`,
  ROW_CLASS_NAME_FORMAT: (v) => `Tên lớp “${v}” không đúng dạng, ví dụ 10A1.`,
  ROW_CLASS_NAME_GRADE: (v) => `Tên lớp “${v}” không bắt đầu bằng khối đã ghi.`,
  ROW_CLASS_MISMATCH: (v) => `Lớp ${v} được ghi khác khối hoặc loại lớp ở các dòng khác.`,
  ROW_CLASS_EXISTS_DIFFERENT: (v) => `Lớp ${v} đã có trong năm học với khối hoặc loại lớp khác.`,
  ROW_STUDENT_NOT_FOUND: (v) => `Không tìm thấy học sinh mã ${v}.`,
  ROW_STUDENT_DUPLICATE: (v) => `Mã học sinh ${v} xuất hiện nhiều lần trong tệp.`,
  ROW_STUDENT_IN_OTHER_CLASS: (v) => `Học sinh đang học lớp ${v} trong năm học này.`,
  ROW_CLASS_FULL: (v) => `Lớp ${v} đã đủ sĩ số tối đa, dòng này vượt sĩ số.`,
  ROW_STUDENT_PREVIOUS_YEAR: (v) => `Học sinh đã học lớp ${v} năm học trước. Hãy xếp lớp bằng chức năng Lên lớp.`,
  ROW_STUDENT_LEFT_CLASS: (v) => `Học sinh đã chuyển đi hoặc thôi học ở lớp ${v}.`,
  WARN_ALREADY_IN_CLASS: (v) => `Học sinh ${v} đã có trong lớp, dòng này được bỏ qua.`,
  WARN_STUDENT_LOCKED: (v) => `Tài khoản học sinh ${v} đang bị khoá.`,
  WARN_NO_PARENT: (v) => `Học sinh ${v} chưa liên kết phụ huynh.`,
  WARN_CLASS_OVER_RECOMMENDED: (v) => `Lớp ${v} vượt sĩ số khuyến nghị khi thêm dòng này (vẫn được nhập).`,
};

export const importRowText = ({ code, value }) => IMPORT_ROW_MESSAGES[code]?.(value) ?? code;
