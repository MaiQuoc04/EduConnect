import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import './feed.css';

// Shared feed UI (14/11/2026) for FE-08 School Feed (owner Anh) and FE-05 Group Feed (owner Khanh), taken from the
// FE-08 screens so both feeds look and behave the same. Styles: feed.css (.feed-*).

/** Underline tabs. tabs: [{ key, label, count? }] – the count shows when > 0. */
export function FeedTabs({ tabs, active, onChange, label }) {
  return (
    <div className="feed-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => active !== t.key && onChange(t.key)}
        >
          {t.label}
          {t.count > 0 && <span className="feed-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FeedSkeleton({ count = 3 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="feed-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  ));
}

export function FeedEmpty({ icon = 'article', children }) {
  return (
    <p className="feed-empty">
      <Icon name={icon} />
      {children}
    </p>
  );
}

export function FeedError({ message, onRetry }) {
  return (
    <div className="feed-error">
      <p className="form-error" role="alert">
        {message}
      </p>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  );
}

/** "‹ Trang 2 / 5 ›" – nothing when everything fits on one page. */
export function FeedPager({ page, total, pageSize, onPage }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <nav className="feed-pager" aria-label="Phân trang">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Trang trước"
      >
        <Icon name="chevron_left" size="sm" />
      </button>
      <span className="caption muted mono">
        Trang {page} / {totalPages}
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        aria-label="Trang sau"
      >
        <Icon name="chevron_right" size="sm" />
      </button>
    </nav>
  );
}

// First picture of a post on its card (signed by the server for one hour). Hidden when it cannot be loaded (link
// expired on a page left open, object missing): the card still shows the attachment count, and the next reload of
// the list brings a new link.
export function FeedCardImage({ src }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <figure className="feed-image">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </figure>
  );
}

// The whole card opens the post; links and buttons inside handle their own clicks. A click that ends a text
// selection (the reader marked some words to copy them) opens nothing – the FE-05 card's check (18/11/2026).
export function openOnClick(navigate, to, state) {
  return (e) => {
    if (e.target.closest('a, button, [role="menu"]') || window.getSelection()?.toString()) return;
    navigate(to, { state });
  };
}

// Long posts on a card: cut after about 280 characters (or 6 lines) at a word boundary, with "…"; null when the text
// is short enough. The card shows "Hiển thị thêm" / "Ẩn bớt" (.feed-text / .feed-more). Moved here unchanged from the
// FE-05 group feed (groupFeedShared.jsx, 14/11/2026) on 18/11/2026 so both feeds cut the same way.
const EXCERPT_CHARS = 280;
const EXCERPT_LINES = 6;
export function excerptOf(text) {
  const lines = text.split('\n');
  let cut = text;
  if (lines.length > EXCERPT_LINES) cut = lines.slice(0, EXCERPT_LINES).join('\n');
  if (cut.length > EXCERPT_CHARS) {
    cut = cut.slice(0, EXCERPT_CHARS);
    const space = cut.search(/\s\S*$/); // last whitespace: do not cut a word in two
    if (space > EXCERPT_CHARS * 0.6) cut = cut.slice(0, space);
  }
  return cut.length < text.length ? `${cut.trimEnd()}…` : null;
}

/**
 * The kind line of a post ("THÔNG BÁO · ĐÃ GHIM", "BÀI VIẾT", "CHỜ DUYỆT"…), the frame of FE-05's PostKind: each feed
 * passes its own words. tone names the colour (feed.css .feed-kind.is-<tone>: news, pending, rejected, hidden; none =
 * ink) – a tone without a rule keeps the ink colour. label may be text or nodes.
 */
export function FeedKind({ icon, label, tone, filled = false, id }) {
  return (
    <span id={id} className={`label-upper feed-kind${tone ? ` is-${tone}` : ''}`}>
      <Icon name={icon} size="sm" filled={filled} />
      {label}
    </span>
  );
}

const QUOTE_CHARS = 140;

/**
 * A confirmation in the feeds' style (native <dialog>, .sf-dialog in styles.css): icon + title, the post quoted
 * (optional, cut after 140 characters), what will happen, the safe button focused. Render it only while asking: it
 * opens when mounted and closes when unmounted. Esc = cancel, except while busy.
 * config: { icon, title, body, label, busy, keep, danger }. quoteClassName: e.g. FE-05's body-font quote.
 * Copied from FE-05's FeedConfirmDialog (groupFeedShared.jsx, 14/11/2026) on 18/11/2026, plus aria-describedby.
 */
export function FeedConfirmDialog({ config, quote, quoteClassName = '', busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.open && dialog.close();
  }, []);
  const text = quote && quote.length > QUOTE_CHARS ? `${quote.slice(0, QUOTE_CHARS).trimEnd()}…` : quote;
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className={`sf-dialog-head${config.danger ? ' is-danger' : ''}`}>
        <Icon name={config.icon} />
        <h2 id={titleId} className="title-sm">
          {config.title}
        </h2>
      </div>
      <div id={descId}>
        {text && <p className={`sf-dialog-quote${quoteClassName ? ` ${quoteClassName}` : ''}`}>{text}</p>}
        <div className={`notice${config.danger ? ' amber' : ''}`}>
          <Icon name={config.danger ? 'warning' : 'info'} size="sm" />
          <p>{config.body}</p>
        </div>
      </div>
      <div className="sf-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          {config.keep}
        </button>
        <button
          type="button"
          className={`btn btn-primary${config.danger ? ' sf-btn-danger' : ''}`}
          onClick={onConfirm}
          disabled={busy}
        >
          <Icon name={busy ? 'progress_activity' : config.icon} size="sm" className={busy ? 'sf-spin' : undefined} />
          {busy ? config.busy : config.label}
        </button>
      </div>
    </dialog>
  );
}

/**
 * One post read in a pop-up over the feed: the feed stays where the reader left it. The page puts the post id in the
 * address (?post=<id>), so Back closes it and a copied link opens it. Native <dialog>: Esc, a click on the dimmed area
 * or the close button (FeedPostDialogClose, placed by the content) close it through onClose; the page behind does
 * not scroll while it is open. Esc while a menu ([role="menu"]) is open only closes the menu (its own key handler).
 * Esc or a click in a dialog opened from inside (a confirmation) is that dialog's own: only events of this <dialog>
 * itself close it (React passes a nested dialog's cancel event up the tree).
 * The shell of FE-05's PostDialog (14/11/2026), taken on 18/11/2026. children: the post (with its .feed-article-top).
 */
export function FeedPostDialog({ titleId, onClose, children }) {
  const ref = useRef(null);
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
      className="feed-post-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return; // a confirmation inside handles its own Esc
        e.preventDefault(); // close through the page, which also puts the address back
        if (ref.current?.querySelector('[role="menu"]')) return;
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()} // a click on the dimmed area
    >
      <div className="feed-post-dialog-body">{children}</div>
    </dialog>
  );
}

/** The × of FeedPostDialog, for the content's top bar (after the action buttons). */
export function FeedPostDialogClose({ onClose }) {
  return (
    <button type="button" className="btn btn-icon feed-post-dialog-close" onClick={onClose} aria-label="Đóng" title="Đóng">
      <Icon name="close" />
    </button>
  );
}

/** A block of the right-hand column. */
export function FeedPanel({ icon, title, titleId, children }) {
  return (
    <section className="feed-panel" aria-labelledby={titleId}>
      <h2 id={titleId} className="feed-panel-title">
        <Icon name={icon} />
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * "Có nội dung mới — Tải lại": a real-time signal never changes the list the reader is going through. schedule() reads
 * again after 0.8–2 s (random, so a post sent to many people does not make every open feed call the API in the same
 * instant; signals meanwhile join that one read) and calls isDifferent(); when it resolves true the pill shows.
 * resetKey: a fresh list is shown (nothing new any more).
 */
export function useNewContent(isDifferent, resetKey) {
  const [hasNew, setHasNew] = useState(false);
  const check = useRef(isDifferent);
  const timer = useRef(null);
  useEffect(() => {
    check.current = isDifferent;
  });
  useEffect(() => setHasNew(false), [resetKey]);
  const run = useCallback(async () => {
    timer.current = null;
    try {
      if (await check.current()) setHasNew(true);
    } catch {
      // quiet: the next signal, reconnect or poll tries again
    }
  }, []);
  const schedule = useCallback(
    (delay = 800 + Math.random() * 1200) => {
      if (timer.current) return;
      timer.current = setTimeout(run, delay);
    },
    [run],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  const dismiss = useCallback(() => setHasNew(false), []);
  return { hasNew, schedule, dismiss };
}

/** Always rendered with zero height and sticky: the pill floats over the list and never moves it. */
export function NewContentPill({ show, onClick }) {
  return (
    <div className="feed-new-wrap" aria-live="polite">
      {show && (
        <button type="button" className="feed-new" onClick={onClick}>
          <Icon name="refresh" size="sm" />
          Có nội dung mới — Tải lại
        </button>
      )}
    </div>
  );
}
