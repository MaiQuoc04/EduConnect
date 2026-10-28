// Shared by the FE-13 account screens (UC-92 Create, UC-93 Import): field labels and the Vietnamese text of the
// field error codes the server returns in details.fields ({ field: code }).

export const FIELD_LABELS = {
  fullName: 'Họ và tên',
  roles: 'Vai trò',
  email: 'Email',
  phone: 'Số điện thoại',
  studentCode: 'Mã học sinh',
  dob: 'Ngày sinh',
  gender: 'Giới tính',
  teacherCode: 'Mã giáo viên',
  department: 'Tổ chuyên môn',
  occupation: 'Nghề nghiệp',
  address: 'Địa chỉ',
};

const GENERIC = {
  REQUIRED: 'Vui lòng nhập thông tin này.',
  TOO_LONG: 'Nội dung vượt quá độ dài cho phép.',
  INVALID: 'Giá trị không hợp lệ.',
  DUPLICATE: 'Giá trị này đã được dùng cho tài khoản khác.',
  DUPLICATE_IN_FILE: 'Trùng với một dòng khác trong file.',
};

const BY_FIELD = {
  roles: {
    REQUIRED: 'Vui lòng chọn ít nhất một vai trò.',
    EXCLUSIVE: 'Quản trị hệ thống và Học sinh không thể kết hợp với vai trò khác.',
  },
  email: { INVALID: 'Email không hợp lệ.', DUPLICATE: 'Email này đã được dùng cho tài khoản khác.' },
  phone: {
    INVALID: 'Số điện thoại gồm 10 chữ số và bắt đầu bằng 0.',
    DUPLICATE: 'Số điện thoại này đã được dùng cho tài khoản khác.',
    REQUIRED_FOR_PARENT: 'Tài khoản phụ huynh bắt buộc có số điện thoại.',
  },
  studentCode: { DUPLICATE: 'Mã học sinh này đã tồn tại.' },
  teacherCode: { DUPLICATE: 'Mã giáo viên này đã tồn tại.' },
  dob: { INVALID: 'Ngày sinh không hợp lệ (dạng dd/mm/yyyy, không sau hôm nay).' },
  gender: { INVALID: 'Giới tính ghi Nam, Nữ hoặc Khác.' },
};

// fieldText('email', 'DUPLICATE') -> 'Email này đã được dùng cho tài khoản khác.'
// With `duplicateRow` (UC-93): 'Trùng với dòng 5 trong file.'
export function fieldText(field, code, duplicateRow) {
  if (code === 'DUPLICATE_IN_FILE' && duplicateRow) return `Trùng với dòng ${duplicateRow} trong file.`;
  return BY_FIELD[field]?.[code] ?? GENERIC[code] ?? GENERIC.INVALID;
}
