import { evaluatePassword } from '../utils/passwordRules.js';
import Icon from './Icon.jsx';

const ICONS = { pass: 'check', fail: 'close', unknown: 'radio_button_unchecked' };

// Live checklist of the password rules (SCR-05). context = { username, phone, current }.
export default function PasswordChecklist({ password, context, serverFailed }) {
  const rules = evaluatePassword(password, context, serverFailed);
  const passed = rules.filter((r) => r.state === 'pass').length;
  return (
    <div className="rules" aria-live="polite">
      <div className="rules-head">
        <span>Yêu cầu bảo mật mật khẩu:</span>
        <span className={`count${passed === rules.length ? ' all' : ''}`}>
          Đạt {passed}/{rules.length} tiêu chí
        </span>
      </div>
      <ul>
        {rules.map((r) => (
          <li key={r.key} className={r.state}>
            <Icon name={ICONS[r.state]} size="sm" />
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
