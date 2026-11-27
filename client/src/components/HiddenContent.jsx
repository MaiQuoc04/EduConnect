import { useId, useState } from 'react';
import { OWN_HIDDEN_NOTE } from '../utils/moderation.js';

/*
 * Moderation (26/11/2026): what the AUTHOR sees of their own hidden message (chat) or hidden comment (feeds).
 * By default the same placeholder the others see ("… đã bị ẩn do vi phạm quy chuẩn cộng đồng"), then a small button
 * that shows the original text in place with "Chỉ bạn xem được nội dung này", and "Ẩn lại" to go back. The open state
 * lives in this component only: a reload or reopening the chat / post shows the placeholder again. UI only – the
 * server already sends the text to its author and to nobody else.
 *
 * placeholder: the placeholder sentence; showLabel: "Xem tin nhắn" / "Xem bình luận"; content: the original text (no
 * button when empty); textClassName: the class of the text line (msg-text / ct-content); className: of the wrapper.
 */
export default function HiddenContent({ placeholder, showLabel, content, textClassName = '', className = '' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const canShow = Boolean(content);
  const shown = open && canShow;
  return (
    <div className={`hidden-content${shown ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <div id={id}>
        {shown ? (
          <>
            <p className={`${textClassName} hidden-content-text`.trim()}>{content}</p>
            <p className="caption muted hidden-content-note">{OWN_HIDDEN_NOTE}</p>
          </>
        ) : (
          <p className={`${textClassName} hidden-content-placeholder`.trim()}>{placeholder}</p>
        )}
      </div>
      {canShow && (
        <button
          type="button"
          className="link-button hidden-content-toggle"
          aria-expanded={shown}
          aria-controls={id}
          onClick={(e) => {
            e.stopPropagation(); // not a tap on the chat bubble (which opens its actions on touch)
            setOpen((v) => !v);
          }}
        >
          {shown ? 'Ẩn lại' : showLabel}
        </button>
      )}
    </div>
  );
}
