import { useCallback, useEffect, useRef, useState } from 'react';

// ASSUMPTION: copied unchanged from FE-02's UpdateStudentPage.jsx (UC-09), where it is not exported, so that SCR-16
// asks before leaving exactly like SCR-09 without touching the FE-02 page. TODO It2 clean-up: move one copy to a
// shared src/hooks/useLeaveGuard.js and use it from both pages.
//
// Asks before leaving the page with unsaved changes: in-app links (sidebar, breadcrumb), the browser Back button and
// closing / reloading the tab.
//
// The app uses <BrowserRouter>, where React Router's useBlocker is not available (it needs a data router), so Back is
// caught with an extra history entry: while the form is dirty one copy of the current entry is pushed; Back pops it,
// the page stays, and the dialog opens. TODO: replace with useBlocker if main.jsx moves to createBrowserRouter.
//
// leave(action, extraBack) is the only way out of the page: it removes that extra entry (plus `extraBack` entries
// behind it) and then runs action.
export default function useLeaveGuard(dirty) {
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
    // Capture phase: runs before React Router's <Link> handler. Links of this page that leave on their own carry
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
