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
  MSG_REASON_TOO_LONG: ({ max } = {}) => `Lý do không được vượt quá ${max ?? 500} ký tự.`,
  MSG_PASSWORD_RULES:'Mật khẩu mới chưa đáp ứng các yêu cầu bảo mật.',
  MSG_WRONG_CURRENT_PASSWORD: 'Mật khẩu hiện tại không đúng.',
  MSG_FILE_TOO_LARGE: ({ maxMb } = {}) => `Tệp vượt quá dung lượng cho phép (tối đa ${maxMb} MB).`,
  MSG_UPLOAD_FAILED: 'Không tải được tệp lên. Vui lòng thử lại.',
  MSG_INVALID_IMAGE: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.',
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
