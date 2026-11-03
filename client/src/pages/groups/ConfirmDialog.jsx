import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';

// Confirmation before a group action (remove a member, leave a team). Uses the native <dialog> (focus stays inside,
// Esc closes). `onConfirm` returns a promise; its error is shown in the dialog.
export default function ConfirmDialog({ title, children, confirmLabel, busyLabel, icon, onConfirm, onCancel }) {
  const ref = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function handleConfirm() {
    setSaving(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="group-dialog" onCancel={onCancel} aria-labelledby="confirm-title">
      <h2 id="confirm-title" className="title-md">
        {title}
      </h2>
      <p>{children}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
        <button type="button" className="btn btn-secondary btn-danger" onClick={handleConfirm} disabled={saving}>
          {icon && <Icon name={icon} size="sm" />}
          {saving ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
