import { createContext, useCallback, useContext, useState } from 'react';
import Icon from '../components/Icon.jsx';

const ToastContext = createContext(() => {});

// Short confirmation messages at the bottom left. Usage: const toast = useToast(); toast('Đã lưu.');
// Optional action button (20/11/2026, FE-06 UC-132): toast('Đã ẩn…', { action: { label: 'Hoàn tác', run } }) – the
// toast closes when it is clicked.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (text, { type = 'success', duration = 5000, action = null } = {}) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, text, type, action }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" role="status">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <Icon name={t.type === 'error' ? 'error' : 'check_circle'} className={t.type === 'error' ? 'err' : 'ok'} filled />
            <p>{t.text}</p>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  dismiss(t.id);
                  t.action.run();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Đóng">
              <Icon name="close" size="sm" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
