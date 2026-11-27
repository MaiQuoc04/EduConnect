import { useEffect, useId, useRef } from 'react';

// A modal of the "Quy chuẩn cộng đồng" screen (native <dialog>, the shared .group-dialog style). Esc closes it through
// onClose unless busy. children: the body; footer: the buttons.
export default function ModDialog({ title, onClose, busy = false, wide = false, children, footer }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`group-dialog mod-dialog${wide ? ' is-wide' : ''}`}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id={`${id}-title`} className="title-md">
        {title}
      </h2>
      {children}
      {footer && <div className="card-footer">{footer}</div>}
    </dialog>
  );
}
