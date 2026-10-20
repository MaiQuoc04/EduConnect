import { useState } from 'react';
import Icon from './Icon.jsx';

// Password field with a show / hide button. `matched` shows a green tick instead (confirmation field).
export default function PasswordInput({ matched, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap">
      <input {...inputProps} type={visible ? 'text' : 'password'} className="input has-action" />
      {matched ? (
        <span className="input-action ok" title="Mật khẩu khớp">
          <Icon name="done_all" />
        </span>
      ) : (
        <button
          type="button"
          className="input-action"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          <Icon name={visible ? 'visibility_off' : 'visibility'} />
        </button>
      )}
    </div>
  );
}
