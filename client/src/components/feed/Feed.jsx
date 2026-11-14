import { useCallback, useEffect, useRef, useState } from 'react';
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

// The whole card opens the post; links and buttons inside handle their own clicks.
export function openOnClick(navigate, to, state) {
  return (e) => {
    if (e.target.closest('a, button, [role="menu"]')) return;
    navigate(to, { state });
  };
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
