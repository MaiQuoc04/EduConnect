import { useEffect, useId, useRef } from 'react';
import { SchoolPostDetail } from './SchoolPostDetailPage.jsx';

// A school post read in a pop-up over the school feed (18/11/2026, lead: same behaviour as the group feed's PostDialog).
// The feed stays where the reader left it. The post id is in the address (?post=<id>), so the browser's Back closes
// the pop-up and a copied link opens the same post. Native <dialog>: Esc, the close button or a click outside close it;
// the page behind does not scroll while it is open. Same content as the SCR-05 page (SchoolPostDetail).
export default function SchoolPostDialog({ schoolPostId, listSearch, onClose, onChanged }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="sf-post-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // Esc: close through the parent, which also puts the address back
        if (e.target === e.currentTarget) onClose(); // Esc in the delete confirmation only closes that one
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()} // a click on the dimmed area
    >
      <div className="sf-post-dialog-body">
        <SchoolPostDetail
          schoolPostId={String(schoolPostId)}
          listSearch={listSearch}
          titleId={titleId}
          onClose={onClose}
          onChanged={onChanged}
        />
      </div>
    </dialog>
  );
}
