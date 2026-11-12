import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';

// FE-08 SCR-31 / SCR-06: asks before leaving a school post form with unsaved changes.
// Copy of the FE-02 useLeaveGuard (pages/students/UpdateStudentPage.jsx, not exported there) so FE-02 is not touched.
// TODO FE-08: move both copies to one shared hook (or React Router useBlocker if main.jsx moves to
// createBrowserRouter) when the team agrees where shared client hooks live.
//
// Catches in-app links (sidebar, breadcrumb), the browser Back button and closing / reloading the tab. Back is caught
// with an extra history entry: while the form is dirty one copy of the current entry is pushed; Back pops it, the
// page stays, and the dialog opens. leave(action, extraBack) is the only way out of the page: it removes that extra
// entry (plus `extraBack` entries behind it) and then runs action.
export function useLeaveGuard(dirty) {
  const armed = useRef(false);
  const leaving = useRef(false);
  const afterPop = useRef(null);
  const ignorePops = useRef(0);
  const [asking, setAsking] = useState(null); // { to } for a link, { back: true } for the Back button, { cancel: true }

  const leave = useCallback((action, extraBack = 0) => {
    leaving.current = true;
    const steps = (armed.current ? 1 : 0) + extraBack;
    armed.current = false;
    if (steps === 0) {
      action?.();
      return;
    }
    afterPop.current = action ?? null;
    window.history.go(-steps);
  }, []);

  useEffect(() => {
    if (leaving.current) return;
    if (dirty && !armed.current) {
      window.history.pushState(window.history.state, '', window.location.href);
      armed.current = true;
    } else if (!dirty && armed.current) {
      armed.current = false;
      ignorePops.current += 1;
      window.history.back();
    }
  }, [dirty]);

  useEffect(() => {
    function onPop() {
      if (leaving.current) {
        const action = afterPop.current;
        afterPop.current = null;
        action?.();
      } else if (ignorePops.current > 0) {
        ignorePops.current -= 1;
      } else if (armed.current) {
        armed.current = false;
        setAsking({ back: true });
      }
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(e) {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = '';
    }
    // Capture phase: runs before React Router's <Link> handler. Links of the page that leave on their own carry
    // data-leave-guard="off".
    function onClick(e) {
      if (leaving.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest?.('a[href]');
      if (!link || link.dataset.leaveGuard === 'off' || link.hasAttribute('download')) return;
      if (link.target && link.target !== '_self') return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      setAsking({ to: url.pathname + url.search + url.hash });
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  // "Keep editing" after Back: put the extra entry back.
  const stay = useCallback(() => {
    if (asking?.back && !armed.current) {
      window.history.pushState(window.history.state, '', window.location.href);
      armed.current = true;
    }
    setAsking(null);
  }, [asking]);

  return { asking, setAsking, stay, leave };
}

// Native <dialog> as the FE-02 confirmations. The safe button ("Tiếp tục soạn") gets the focus.
export function LeaveDialog({ open, onStay, onLeave }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      aria-labelledby="sf-leave-title"
      aria-describedby="sf-leave-desc"
      onCancel={(e) => {
        e.preventDefault();
        onStay();
      }}
    >
      <div className="sf-dialog-head">
        <Icon name="edit_note" />
        <h2 id="sf-leave-title" className="title-sm">
          Bỏ các thay đổi chưa lưu?
        </h2>
      </div>
      <p id="sf-leave-desc" className="muted">
        Nội dung bạn vừa soạn sẽ không được lưu nếu rời trang này.
      </p>
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onStay} autoFocus>
          Tiếp tục soạn
        </button>
        <button type="button" className="btn btn-primary" onClick={onLeave}>
          Bỏ thay đổi
        </button>
      </div>
    </dialog>
  );
}
