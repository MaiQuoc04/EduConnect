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
    field === 'subjectIds' ? `Chỉ chọn tối đa ${max} môn.` : 'Quá nhiều thay đổi trong một lần lưu.',
  MSG_INVALID_NAME: ({ reason } = {}) => NAME_REASON_TEXT[reason] ?? 'Họ và tên không hợp lệ.',
  MSG_INVALID_DEPARTMENT: ({ reason } = {}) => DEPARTMENT_REASON_TEXT[reason] ?? 'Tên tổ chuyên môn không hợp lệ.',
  MSG_DEPARTMENT_INVALID: 'Tổ chuyên môn không còn trong danh sách. Vui lòng tải lại trang và chọn lại.',
  MSG_DEPARTMENTS_NOT_READY:
    'Danh sách tổ chuyên môn chưa được tạo trong cơ sở dữ liệu (cần chạy database/patch_v0.3_departments.sql).',
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
  MSG_IMPORT_TOO_MANY_ROWS: ({ max } = {}) => `Mỗi file chỉ được tối đa ${max} dòng. Vui lòng chia nhỏ file.`,
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
