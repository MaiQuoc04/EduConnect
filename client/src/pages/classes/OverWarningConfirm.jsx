import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';

// Class size (27/11/2026, FE-04): the server answers 409 MSG_CLASS_OVER_WARNING when a class would go above the
// recommended size (School Manager setting, default 45). The screen shows this box; "Vẫn tiếp tục" sends the same
// request again with confirmOverWarning: true. The hard cap (MSG_CLASS_FULL) is an ordinary error, never confirmed.
// Used by UC-28 (create a class, add students) and FE-02 UC-10 transfer / UC-11 promotion.
export const isOverWarning = (err) => err?.code === 'MSG_CLASS_OVER_WARNING';

export default function OverWarningConfirm({ warning, busy, onConfirm, onCancel, confirmLabel = 'Vẫn tiếp tục' }) {
  if (!warning) return null;
  return (
    <div className="confirm-box amber" role="alertdialog" aria-labelledby="over-warning-text">
      <div className="confirm-head">
        <Icon name="warning" />
        <p id="over-warning-text">
          {errorText(warning)} Lớp đông có thể ảnh hưởng đến việc dạy và học. Bạn vẫn muốn tiếp tục?
        </p>
      </div>
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Huỷ
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {busy ? 'Đang lưu…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
