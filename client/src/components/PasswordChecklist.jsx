import { evaluatePassword } from '../utils/passwordRules.js';
import Icon from './Icon.jsx';

const ICONS = { pass: 'check', fail: 'close', unknown: 'radio_button_unchecked', later: 'schedule' };

// Live checklist of the password rules (SCR-34). context = { username, phone, current }.
// A rule the client cannot check ('later') is shown "kiểm tra khi lưu" and left out of the count, so a valid password
// reads e.g. "Đạt 6/6 tiêu chí" instead of looking unmet (FE-13 owner, 27/11/2026).
export default function PasswordChecklist({ password, context, serverFailed }) {
  const rules = evaluatePassword(password, context, serverFailed);
  const counted = rules.filter((r) => r.state !== 'later');
  const passed = counted.filter((r) => r.state === 'pass').length;
  return (
    <div className="rules" aria-live="polite">
      <div className="rules-head">
        <span>Yêu cầu bảo mật mật khẩu:</span>
        <span className={`count${passed === counted.length ? ' all' : ''}`}>
          Đạt {passed}/{counted.length} tiêu chí
        </span>
      </div>
      <ul>
        {rules.map((r) => (
          <li key={r.key} className={r.state}>
            <Icon name={ICONS[r.state]} size="sm" />
            {r.label}
            {r.state === 'later' && <span className="caption muted"> (kiểm tra khi lưu)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
