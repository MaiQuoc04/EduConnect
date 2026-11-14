import { useEffect, useId, useRef } from 'react';
import Icon from '../../components/Icon.jsx';
import PostDetail from './PostDetail.jsx';

// A group post read in a pop-up over the feed (14/11/2026): the feed stays where the reader left it. The post id is in
// the address (?post=<id>), so the browser's Back closes the pop-up and a copied link opens the same post. Native
// <dialog>: Esc, the close button or a click outside close it; the page behind does not scroll while it is open.
// Same content as the SCR-37 page (PostDetail).
export default function PostDialog({ g, postId, onClose, onChanged }) {
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
      className="gf-post-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // Esc: close through the parent, which also puts the address back
        // Esc with the "⋮" menu open only closes the menu (its own key handler does that).
        if (ref.current?.querySelector('[role="menu"]')) return;
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()} // a click on the dimmed area
    >
      <div className="gf-post-dialog-body">
        <PostDetail
          key={postId}
          g={g}
          postId={postId}
          titleId={titleId}
          leading={<span className="title-sm gf-post-dialog-title">Bài viết</span>}
          trailing={
            <button type="button" className="btn btn-icon gf-post-dialog-close" onClick={onClose} aria-label="Đóng" title="Đóng">
              <Icon name="close" />
            </button>
          }
          editState={{ from: 'popup' }}
          actionsMenu
          onDeleted={onClose}
          onChanged={onChanged}
        />
      </div>
    </dialog>
  );
}
