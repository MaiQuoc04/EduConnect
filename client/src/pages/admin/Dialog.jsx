import { useEffect, useRef } from 'react';
import Icon from '../../components/Icon.jsx';

// Small modal dialog (FE-13). Closes with Escape or the close button; focus moves into the dialog.
export default function Dialog({ title, icon, tone = 'ink', onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('input, textarea, button.btn-primary, button.btn-danger-solid')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={ref}>
        <div className="dialog-head">
          {icon && (
            <span className={`dialog-icon ${tone}`}>
              <Icon name={icon} />
            </span>
          )}
          <h2 id="dialog-title" className="title-sm">
            {title}
          </h2>
          {onClose && (
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Đóng">
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
