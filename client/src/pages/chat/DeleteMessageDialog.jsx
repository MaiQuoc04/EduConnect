import { useEffect, useRef, useState } from 'react';
import { errorText } from '../../messages.js';

// UC-113 Delete Message: only the choices open to this message. "Xoá ở phía mọi người": own message, within the time
// limit, where sending is open. "Xoá ở phía tôi": always. The server checks everything again.
export default function DeleteMessageDialog({ forEveryone, expired, onDelete, onCancel }) {
  const ref = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function choose(scope) {
    setSaving(true);
    setError('');
    try {
      await onDelete(scope);
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="group-dialog" onCancel={onCancel} aria-labelledby="delete-message-title">
      <h2 id="delete-message-title" className="title-md">
        Xoá tin nhắn
      </h2>
      {forEveryone && <p>Xoá ở phía mọi người: tin nhắn được thay bằng dòng “Tin nhắn đã được xoá”.</p>}
      <p>Xoá ở phía tôi: tin nhắn chỉ biến mất ở phía bạn. Những người khác vẫn thấy.</p>
      {expired && <p className="caption muted">Tin nhắn đã quá thời hạn nên chỉ xoá được ở phía bạn.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => choose('me')} disabled={saving}>
          Xoá ở phía tôi
        </button>
        {forEveryone && (
          <button type="button" className="btn btn-secondary btn-danger" onClick={() => choose('everyone')} disabled={saving}>
            Xoá ở phía mọi người
          </button>
        )}
      </div>
    </dialog>
  );
}
