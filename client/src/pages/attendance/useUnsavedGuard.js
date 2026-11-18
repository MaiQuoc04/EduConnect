import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// FE-12 (18/11/2026): asks before unsaved attendance is lost – a link of the app (menu, breadcrumb), the browser Back
// button, closing / reloading the tab, and changes inside the page (another period, day, class or tab) through
// `run(action)`. Not pages/schoolfeed/leaveGuard.jsx: that one is made for a form that is left once, while this page
// keeps changing its own address (?lesson=&date=&classId=) and must be guarded again afterwards.
//
// Back is caught with one extra history entry pushed while there are unsaved changes. Leaving it (save, or a change
// inside the page) first removes that entry, then runs the action, so the address never jumps back.
const QUESTION = 'Bảng điểm danh đang có thay đổi chưa lưu. Bỏ các thay đổi này?';

export default function useUnsavedGuard(dirty) {
  const navigate = useNavigate();
  const armed = useRef(false);
  const pending = useRef(null); // action to run once the extra entry is gone
  const ignorePops = useRef(0);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Removes the extra entry (if any), then runs action.
  const disarm = useCallback((action) => {
    if (armed.current) {
      armed.current = false;
      pending.current = action ?? null;
      ignorePops.current += 1;
      window.history.back();
    } else {
      action?.();
    }
  }, []);

  useEffect(() => {
    if (dirty && !armed.current) {
      window.history.pushState(window.history.state, '', window.location.href);
      armed.current = true;
    } else if (!dirty && armed.current) {
      disarm(null); // saved: the address is the same, only the extra entry goes
    }
  }, [dirty, disarm]);

  useEffect(() => {
    function onPop() {
      if (ignorePops.current > 0) {
        ignorePops.current -= 1;
        const action = pending.current;
        pending.current = null;
        action?.();
        return;
      }
      if (!armed.current) return;
      // The user pressed Back while there are unsaved changes.
      armed.current = false;
      if (window.confirm(QUESTION)) {
        window.history.back(); // leave for real
      } else {
        window.history.pushState(window.history.state, '', window.location.href);
        armed.current = true;
      }
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    // Capture phase: before React Router's <Link> handler.
    function onClick(e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest?.('a[href]');
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      if (!window.confirm(QUESTION)) return;
      disarm(() => navigate(url.pathname + url.search + url.hash));
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, disarm, navigate]);

  // A change inside the page: asks when needed, then runs action. Returns false when the user stays.
  const run = useCallback(
    (action) => {
      if (dirtyRef.current && !window.confirm(QUESTION)) return false;
      disarm(action);
      return true;
    },
    [disarm],
  );

  return { run };
}
