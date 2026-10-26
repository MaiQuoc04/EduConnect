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
