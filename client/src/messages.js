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
  MSG_PASSWORD_RULES: 'Mật khẩu mới chưa đáp ứng các yêu cầu bảo mật.',
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
  MSG_TRACK_NAME_TAKEN: 'Tên này đã được dùng cho một loại lớp khác, kể cả loại lớp đã xoá.',
  MSG_TRACK_NAME_LENGTH: 'Tên loại lớp tối đa 100 ký tự.',
  MSG_TRACK_DESCRIPTION_LENGTH: 'Mô tả tối đa 255 ký tự.',
  MSG_TRACK_IN_USE: 'Đang có lớp thuộc loại này nên không xoá được.',
  MSG_TRACK_WEIGHT_RANGE: 'Hệ số phải lớn hơn 0, tối đa 10 và có nhiều nhất 2 chữ số thập phân.',
  MSG_TRACK_PERIODS_RANGE: 'Số tiết mỗi tuần là số nguyên từ 1 đến 10.',
  MSG_TRACK_SUBJECT_DUPLICATE: 'Một môn học bị chọn hai lần.',
  MSG_TRACK_WEIGHTS_LOCKED: 'Năm học đã có điểm nên không thể thêm, bỏ môn hoặc đổi hệ số.',
  MSG_TRACK_CONFIG_EXISTS: 'Năm học này đã có thiết lập môn cho các loại lớp.',
  MSG_TRACK_COPY_SAME_YEAR: 'Vui lòng chọn hai năm học khác nhau.',
  MSG_TRACK_COPY_EMPTY: 'Năm học nguồn chưa có thiết lập để sao chép.',
  MSG_IMPORT_FILE_TYPE: 'Vui lòng chọn tệp Excel (.xlsx).',
  MSG_IMPORT_HEADER: ({ missing } = {}) =>
    `Tệp thiếu cột${missing?.length ? `: ${missing.join(', ')}` : ''}. Vui lòng dùng file mẫu.`,
  MSG_IMPORT_EMPTY: 'Tệp chưa có dòng dữ liệu nào.',
  MSG_IMPORT_TOO_MANY_ROWS: ({ maxRows } = {}) => `Tệp có quá ${maxRows ?? 2000} dòng.`,
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
  MSG_TEAM_MEMBER_NOT_ELIGIBLE: 'Có người không thuộc lớp hoặc tài khoản đang bị khoá.',
  MSG_CLASS_STUDENT_DUPLICATE: 'Một học sinh bị chọn hai lần.',
  MSG_STUDENT_ALREADY_ENROLLED: ({ classes } = {}) =>
    `Có học sinh đang học lớp khác trong năm học${classes?.length ? ` (${classes.join(', ')})` : ''}.`,
};

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
  ROW_CLASS_NAME_FORMAT: (v) => `Tên lớp “${v}” không đúng dạng, ví dụ 10A1.`,
  ROW_CLASS_NAME_GRADE: (v) => `Tên lớp “${v}” không bắt đầu bằng khối đã ghi.`,
  ROW_CLASS_MISMATCH: (v) => `Lớp ${v} được ghi khác khối hoặc loại lớp ở các dòng khác.`,
  ROW_CLASS_EXISTS_DIFFERENT: (v) => `Lớp ${v} đã có trong năm học với khối hoặc loại lớp khác.`,
  ROW_STUDENT_NOT_FOUND: (v) => `Không tìm thấy học sinh mã ${v}.`,
  ROW_STUDENT_DUPLICATE: (v) => `Mã học sinh ${v} xuất hiện nhiều lần trong tệp.`,
  ROW_STUDENT_IN_OTHER_CLASS: (v) => `Học sinh đang học lớp ${v} trong năm học này.`,
  ROW_STUDENT_LEFT_CLASS: (v) => `Học sinh đã chuyển đi hoặc thôi học ở lớp ${v}.`,
  WARN_ALREADY_IN_CLASS: (v) => `Học sinh ${v} đã có trong lớp, dòng này được bỏ qua.`,
  WARN_STUDENT_LOCKED: (v) => `Tài khoản học sinh ${v} đang bị khoá.`,
  WARN_NO_PARENT: (v) => `Học sinh ${v} chưa liên kết phụ huynh.`,
};

export const importRowText = ({ code, value }) => IMPORT_ROW_MESSAGES[code]?.(value) ?? code;
