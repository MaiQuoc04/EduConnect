import { DEPARTMENT_REASON_TEXT, NAME_REASON_TEXT } from './utils/teacherValidation.js';

// Vietnamese UI text for API error codes. The server keeps its messages in English; the client shows these.
// Add a line here whenever a module introduces a new error code.
const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Không kết nối được máy chủ. Vui lòng thử lại.',
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
  MSG_TRACK_NAME_SCOPE: 'Tên này đang dùng cho loại lớp “mọi khối” hoặc loại lớp theo khối, không dùng được cho cả hai.',
  MSG_TRACK_NAME_LENGTH: 'Tên loại lớp tối đa 100 ký tự.',
  MSG_TRACK_GRADE_DUPLICATE: 'Một khối bị chọn hai lần.',
  MSG_TRACK_GRADE: 'Loại lớp này dành cho khối khác.',
  MSG_TRACK_GRADE_IN_USE: 'Đang có lớp thuộc khối khác dùng loại lớp này nên không đổi khối được.',
  MSG_TRACK_DESCRIPTION_LENGTH: 'Mô tả tối đa 255 ký tự.',
  MSG_TRACK_IN_USE: 'Đang có lớp thuộc loại này nên không xoá được.',
  MSG_TRACK_PERIODS_RANGE: 'Số tiết mỗi tuần là số nguyên từ 1 đến 10.',
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
  MSG_NICKNAME_TOO_LONG: ({ max } = {}) => `Biệt danh tối đa ${max ?? 50} ký tự.`,
  MSG_NICKNAME_INVALID: 'Biệt danh chỉ gồm chữ trên một dòng.',
  MSG_NICKNAME_NOT_STUDENT: 'Chỉ đặt biệt danh cho học sinh đang học trong lớp.',
  MSG_GROUP_CANNOT_LEAVE: 'Không thể rời nhóm chung, nhóm học sinh hay nhóm phụ huynh của lớp. Chỉ có thể rời team.',
  MSG_TEAM_NAME_REQUIRED: 'Vui lòng nhập tên team.',
  MSG_TEAM_NAME_LENGTH: ({ min, max } = {}) => `Tên team gồm ${min ?? 2}–${max ?? 100} ký tự, trên một dòng.`,
  MSG_TEAM_TOO_FEW: ({ min } = {}) => `Vui lòng chọn ít nhất ${min ?? 2} người khác cho team.`,
  MSG_TEAM_TOO_MANY: ({ max } = {}) => `Một team có tối đa ${max ?? 50} thành viên.`,
  MSG_TEAM_CLASS_NOT_ALLOWED: 'Bạn chỉ tạo được team trong lớp của mình.',
  MSG_TEAM_MEMBER_NOT_ELIGIBLE: 'Có người không thuộc lớp hoặc nhóm này, hoặc tài khoản đang bị khoá.',
  MSG_TEAM_SCHOOL_NOT_ALLOWED: 'Chỉ giáo viên trong nhóm giáo viên toàn trường mới tạo được team giáo viên.',
  // FE-06 Messaging
  MSG_CHAT_NO_ACCESS: 'Quản lý trường không xem tin nhắn của nhóm lớp.',
  MSG_CHAT_NOT_MEMBER: 'Bạn không còn là thành viên của cuộc trò chuyện này.',
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
  MSG_CLASS_FULL: ({ max, current } = {}) =>
    `Một lớp có tối đa ${max ?? 45} học sinh${current ? `; lớp đang có ${current} học sinh` : ''}.`,
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
  ROW_CLASS_FULL: (v) => `Lớp ${v} đã đủ 45 học sinh, dòng này vượt sĩ số.`,
  ROW_STUDENT_PREVIOUS_YEAR: (v) => `Học sinh đã học lớp ${v} năm học trước. Hãy xếp lớp bằng chức năng Lên lớp.`,
  ROW_STUDENT_LEFT_CLASS: (v) => `Học sinh đã chuyển đi hoặc thôi học ở lớp ${v}.`,
  WARN_ALREADY_IN_CLASS: (v) => `Học sinh ${v} đã có trong lớp, dòng này được bỏ qua.`,
  WARN_STUDENT_LOCKED: (v) => `Tài khoản học sinh ${v} đang bị khoá.`,
  WARN_NO_PARENT: (v) => `Học sinh ${v} chưa liên kết phụ huynh.`,
};

export const importRowText = ({ code, value }) => IMPORT_ROW_MESSAGES[code]?.(value) ?? code;
