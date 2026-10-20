// Same rules as server/src/utils/password.js (business-rules §3); the server has the final say.
// test() returns true / false, or null when the client cannot know (e.g. the previous password).
export const PASSWORD_RULES = [
  { key: 'LENGTH', label: '8–32 ký tự', test: (p) => p.length >= 8 && p.length <= 32 },
  { key: 'UPPERCASE', label: 'Chữ hoa (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'LOWERCASE', label: 'Chữ thường (a–z)', test: (p) => /[a-z]/.test(p) },
  { key: 'DIGIT', label: 'Ít nhất một chữ số (0–9)', test: (p) => /[0-9]/.test(p) },
  { key: 'SPECIAL', label: 'Ký tự đặc biệt (!@#$%…)', test: (p) => /[^A-Za-z0-9]/.test(p) },
  {
    key: 'NO_IDENTIFIER',
    label: 'Không chứa tên đăng nhập hoặc số điện thoại',
    test: (p, { username, phone }) => {
      if (!username && !phone) return null;
      return !(username && p.toLowerCase().includes(username.toLowerCase())) && !(phone && p.includes(phone));
    },
  },
  {
    key: 'NOT_PREVIOUS',
    label: 'Khác mật khẩu cũ gần nhất',
    test: (p, { current }) => (current ? p !== current : null),
  },
];

// Returns [{ key, label, state: 'pass' | 'fail' | 'unknown' }]; failures reported by the server win.
export function evaluatePassword(password, context = {}, serverFailed = []) {
  return PASSWORD_RULES.map((rule) => {
    if (serverFailed.includes(rule.key)) return { ...rule, state: 'fail' };
    if (!password) return { ...rule, state: 'unknown' };
    const result = rule.test(password, context);
    return { ...rule, state: result === null ? 'unknown' : result ? 'pass' : 'fail' };
  });
}
