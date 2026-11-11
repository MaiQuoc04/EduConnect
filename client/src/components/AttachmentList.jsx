import { useEffect, useRef, useState } from 'react';
import { downloadUrl } from '../api/uploads.js';
import { formatFileSize } from '../utils/format.js';
import { fileIcon } from './AttachmentPicker.jsx';
import Icon from './Icon.jsx';
import './AttachmentList.css';

// Shows the attachments of a post or a message – FE-08 SCR-05 now, FE-05 / FE-06 later (Khanh). Each item is what the
// server's shared listAttachments returns: { attachmentId, fileName, mimeType, sizeBytes, url } with `url` signed for
// ONE hour (private bucket), or null when it could not be signed.
//   - images: inline, lazy; a click opens the full image in a dialog;
//   - videos: <video controls>, never autoplay, preload="none" (no byte is downloaded before "play": Free plan egress);
//   - other files: icon, original name, size, "Tải xuống" (Supabase sends it under the original name).
// Expired links: the page passes onRefresh(), which reads the post again and resolves to its fresh attachments.
//   - a picture or a video that fails to load asks for ONE refresh automatically (most likely the hour is over); if the
//     new link fails too, or a refresh happened less than 15 s ago, the item shows "Thử lại" instead (no loop);
//   - "Tải xuống" cannot see a failure (the browser leaves the page), so when the links are older than 55 minutes it
//     refreshes first and then downloads with the new link.
// signedAt = Date.now() when the attachments were received.
// Stable links: each re-read of the post (socket signal, reconnect, tab shown again) brings NEW signed links for the
// same files. Swapping them would restart a playing video and download every picture again (the browser caches by
// URL: egress). So a file keeps the link it was first shown with while that link is younger than 55 minutes and has
// not failed; only then is the new one used.

// ASSUMPTION: links are signed for 3600 s (server SIGNED_URL_TTL_SECONDS); refreshed 5 minutes before.
const LINK_LIFETIME_MS = 55 * 60 * 1000;
const MIN_REFRESH_GAP_MS = 15 * 1000;

const kindOf = (mimeType = '') => (mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'file');

export default function AttachmentList({ attachments: received, signedAt, onRefresh, title = 'Tệp đính kèm', headingId }) {
  const [failed, setFailed] = useState(() => new Set()); // urls that failed to load
  const [viewing, setViewing] = useState(null); // image shown in the dialog
  const lastRefresh = useRef(0);
  const dialogRef = useRef(null);
  const links = useRef(new Map()); // attachmentId -> { url, at }: the link shown for it, see "Stable links" above

  const now = Date.now();
  const attachments = (received ?? []).map((f) => {
    const kept = links.current.get(f.attachmentId);
    if (kept && f.url && now - kept.at < LINK_LIFETIME_MS && !failed.has(kept.url)) return { ...f, url: kept.url, signedAt: kept.at };
    const at = signedAt ?? now;
    if (f.url) links.current.set(f.attachmentId, { url: f.url, at });
    return { ...f, signedAt: at };
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (viewing && !dialog.open) dialog.showModal();
    if (!viewing && dialog.open) dialog.close();
  }, [viewing]);

  if (!attachments.length) return null;

  async function refresh() {
    lastRefresh.current = Date.now();
    try {
      return (await onRefresh?.()) ?? null;
    } catch {
      return null;
    }
  }

  // A picture / video did not load: one automatic refresh, then a manual "Thử lại".
  function onMediaError(url) {
    setFailed((set) => new Set(set).add(url));
    if (onRefresh && Date.now() - lastRefresh.current > MIN_REFRESH_GAP_MS) refresh();
  }

  async function onDownload(e, file) {
    if (!onRefresh || Date.now() - (file.signedAt ?? 0) < LINK_LIFETIME_MS) return; // fresh: the link opens normally
    e.preventDefault();
    const fresh = await refresh();
    const again = fresh?.find((f) => f.attachmentId === file.attachmentId);
    if (!again?.url) return;
    links.current.set(file.attachmentId, { url: again.url, at: Date.now() });
    window.location.assign(downloadUrl(again.url, again.fileName));
  }

  const images = attachments.filter((f) => kindOf(f.mimeType) === 'image');
  const videos = attachments.filter((f) => kindOf(f.mimeType) === 'video');
  const others = attachments.filter((f) => kindOf(f.mimeType) === 'file');
  const broken = (f) => !f.url || failed.has(f.url);

  const retryButton = (
    <button type="button" className="btn btn-secondary al-retry" onClick={refresh}>
      <Icon name="refresh" size="sm" />
      Thử lại
    </button>
  );

  return (
    <section className="attachment-list" aria-labelledby={headingId}>
      <h2 id={headingId} className="al-title">
        <Icon name="attach_file" size="sm" />
        {title} ({attachments.length})
      </h2>

      {images.length > 0 && (
        <div className={`al-images${images.length === 1 ? ' is-single' : ''}`}>
          {images.map((f) =>
            broken(f) ? (
              <div key={f.attachmentId} className="al-missing" role="status">
                <Icon name="broken_image" />
                <span className="caption">Không tải được ảnh {f.fileName}.</span>
                {retryButton}
              </div>
            ) : (
              <button
                key={f.attachmentId}
                type="button"
                className="al-image"
                onClick={() => setViewing(f)}
                aria-label={`Xem ảnh ${f.fileName} cỡ lớn`}
              >
                <img src={f.url} alt={f.fileName} loading="lazy" onError={() => onMediaError(f.url)} />
              </button>
            ),
          )}
        </div>
      )}

      {videos.map((f) =>
        broken(f) ? (
          <div key={f.attachmentId} className="al-missing" role="status">
            <Icon name="videocam_off" />
            <span className="caption">Không tải được video {f.fileName}.</span>
            {retryButton}
          </div>
        ) : (
          <figure key={f.attachmentId} className="al-video">
            {/* No autoplay, nothing preloaded: a video is only downloaded when the reader presses play. */}
            <video src={f.url} controls preload="none" playsInline onError={() => onMediaError(f.url)}>
              <a href={downloadUrl(f.url, f.fileName)}>Tải video {f.fileName}</a>
            </video>
            <figcaption className="caption muted">
              {f.fileName} · {formatFileSize(f.sizeBytes)}
            </figcaption>
          </figure>
        ),
      )}

      {others.length > 0 && (
        <ul className="al-files">
          {others.map((f) => (
            <li key={f.attachmentId}>
              <span className="al-file-icon">
                <Icon name={fileIcon(f.mimeType)} />
              </span>
              <span className="al-file-text">
                <span className="al-file-name" title={f.fileName}>
                  {f.fileName}
                </span>
                <span className="caption muted">{formatFileSize(f.sizeBytes)}</span>
              </span>
              {f.url ? (
                <a
                  className="btn btn-secondary al-download"
                  href={downloadUrl(f.url, f.fileName)}
                  onClick={(e) => onDownload(e, f)}
                  aria-label={`Tải xuống ${f.fileName}`}
                >
                  <Icon name="download" size="sm" />
                  <span>Tải xuống</span>
                </a>
              ) : (
                retryButton
              )}
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className="al-viewer"
        aria-label={viewing ? `Ảnh ${viewing.fileName}` : 'Ảnh'}
        onClose={() => setViewing(null)}
        onClick={(e) => e.target === e.currentTarget && setViewing(null)}
      >
        {viewing && (
          <>
            <img src={viewing.url} alt={viewing.fileName} onError={() => onMediaError(viewing.url)} />
            <div className="al-viewer-bar">
              <span className="caption al-viewer-name">{viewing.fileName}</span>
              <a className="btn btn-secondary" href={downloadUrl(viewing.url, viewing.fileName)} onClick={(e) => onDownload(e, viewing)}>
                <Icon name="download" size="sm" />
                Tải xuống
              </a>
              <button type="button" className="btn btn-primary" onClick={() => setViewing(null)} autoFocus>
                <Icon name="close" size="sm" />
                Đóng
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
