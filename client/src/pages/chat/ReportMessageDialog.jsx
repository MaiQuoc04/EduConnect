import { useEffect, useId, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { REPORT_REASONS, SUPPORT_HINT, SUPPORT_REASON } from '../../utils/moderation.js';

// Report a chat message (moderation phase 5, FE-08 Anh, 25/11/2026): someone else's message only (MessageRow shows
// "Báo cáo" on those). A reason, an optional note ("Lý do khác" needs one, as the server). Choosing "Cần được hỗ trợ"
// shows at once where to get help right now. The sender never learns who reported; nothing changes for the message
// until the School Manager decides. onSubmit({ reason, note? }) resolves or throws the API error.

const MAX_NOTE = 500; // message_reports.note VARCHAR(500)
const clean = (text) => text.normalize('NFC').trim();

export default function ReportMessageDialog({ message, onSubmit, onCancel }) {
  const ref = useRef(null);
  const id = useId();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const noteLength = [...clean(note)].length;
  const needsNote = reason === 'OTHER' && noteLength === 0;
  const canSend = Boolean(reason) && !needsNote && noteLength <= MAX_NOTE && !busy;
  const who = message.senderNickname || message.senderName;

  async function send(e) {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ reason, ...(noteLength ? { note: clean(note) } : {}) });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="group-dialog chat-report-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form onSubmit={send} noValidate>
        <h2 id={`${id}-title`} className="title-md">
          Báo cáo tin nhắn
        </h2>
        {message.content && (
          <p className="chat-report-quote">
            <strong>{who}:</strong> {message.content}
          </p>
        )}
        <fieldset className="chat-report-reasons" disabled={busy}>
          <legend className="chat-report-legend">Lý do báo cáo</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.code} className={`chat-report-reason${reason === r.code ? ' is-checked' : ''}`}>
              <input
                type="radio"
                name={`${id}-reason`}
                value={r.code}
                checked={reason === r.code}
                onChange={() => {
                  setReason(r.code);
                  setError('');
                }}
              />
              <span>{r.label}</span>
            </label>
          ))}
        </fieldset>
        {reason === SUPPORT_REASON && (
          <div className="notice amber" role="status">
            <Icon name="support" size="sm" />
            <p>{SUPPORT_HINT}</p>
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-note`} className="chat-report-legend">
            Ghi chú{' '}
            <span className="caption muted">{reason === 'OTHER' ? '(bắt buộc khi chọn “Lý do khác”)' : '(không bắt buộc)'}</span>
          </label>
          <textarea
            id={`${id}-note`}
            className="input"
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError('');
            }}
            disabled={busy}
            placeholder="Mô tả thêm để Ban giám hiệu dễ xem xét…"
            aria-invalid={noteLength > MAX_NOTE}
          />
          <span className={`caption muted mono chat-report-count${noteLength > MAX_NOTE ? ' over' : ''}`}>
            {noteLength.toLocaleString('vi-VN')} / {MAX_NOTE.toLocaleString('vi-VN')}
          </span>
        </div>
        <div className="notice">
          <Icon name="shield_person" size="sm" />
          <p>Người gửi sẽ không biết ai đã báo cáo. Tin nhắn vẫn hiển thị cho đến khi được xem xét.</p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="card-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSend}>
            <Icon name="flag" size="sm" />
            {busy ? 'Đang gửi…' : 'Gửi báo cáo'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
