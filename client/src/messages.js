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
  // FE-03 Teacher Management
  TEACHER_NOT_FOUND: 'Không tìm thấy giáo viên này.',
  INVALID_DATE: 'Ngày không hợp lệ.',
  MSG_FIELD_TOO_LONG: ({ max } = {}) => `Nội dung quá dài (tối đa ${max ?? ''} ký tự).`,
  MSG_SUBJECT_INVALID: 'Có môn học không còn tồn tại. Vui lòng tải lại trang.',
  MSG_SUBJECT_IN_USE: ({ subjects = [] } = {}) =>
    `Không thể bỏ ${subjects.map((s) => `môn ${s.name} (đang dạy ${s.classes.join(', ')})`).join('; ')}. ` +
    'Hãy phân công lại giảng dạy trước.',
  MSG_INVALID_INPUT: 'Dữ liệu gửi lên không hợp lệ. Vui lòng tải lại trang.',
  MSG_TOO_MANY: 'Quá nhiều thay đổi trong một lần lưu.',
  SCHOOL_YEAR_NOT_FOUND: 'Không tìm thấy năm học.',
  MSG_HOMEROOM_STALE: ({ classes = [] } = {}) =>
    `Lớp ${classes.join(', ')} vừa được người khác thay đổi. Hãy tải lại dữ liệu rồi phân công lại.`,
  MSG_TEACHER_LOCKED: ({ teachers = [] } = {}) =>
    `Không thể phân công ${teachers.join(', ')} làm chủ nhiệm vì tài khoản đã bị khoá.`,
  MSG_HOMEROOM_LIMIT: ({ max = 1, conflicts = [] } = {}) =>
    `Mỗi giáo viên chủ nhiệm tối đa ${max} lớp: ` +
    conflicts.map((c) => `${c.teacher} (${c.classes.join(', ')})`).join('; ') + '.',
  MSG_EFFECTIVE_DATE: ({ min, max } = {}) =>
    `Ngày áp dụng phải từ ${formatVnDate(min)} đến ${formatVnDate(max)} (không sửa phân công trong quá khứ).`,
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
