import { useState } from 'react';
import { downloadUrl } from '../../api/uploads.js';
import { fileIcon } from '../../components/AttachmentPicker.jsx';
import Icon from '../../components/Icon.jsx';
import { formatFileSize } from '../../utils/format.js';

// FE-06: the files of one chat message, small enough for a bubble (the FE-08 AttachmentList is made for a post page).
//   - pictures: thumbnails (one large, several in a grid); a click opens the picture in a new tab;
//   - videos: <video controls>, nothing downloaded before "play" (preload="none", Free plan egress);
//   - other files: icon, name, size and a download link (Supabase sends it under its original name).
// Links are signed by the server for one hour. A picture or video that fails to load (link expired in a chat left
// open) calls onExpired() once: the thread reads that message again and passes new links.

const kindOf = (mimeType = '') => (mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'file');

export default function MessageFiles({ files, onExpired }) {
  const [asked, setAsked] = useState(false);
  if (!files?.length) return null;
  const expired = () => {
    if (asked) return;
    setAsked(true);
    onExpired?.();
  };
  const images = files.filter((f) => kindOf(f.mimeType) === 'image' && f.url);
  const videos = files.filter((f) => kindOf(f.mimeType) === 'video' && f.url);
  const others = files.filter((f) => kindOf(f.mimeType) === 'file' || !f.url);

  return (
    <div className="msg-files" onClick={(e) => e.stopPropagation()}>
      {images.length > 0 && (
        <div className={`msg-images${images.length === 1 ? ' is-single' : ''}`}>
          {images.map((f) => (
            <a key={f.attachmentId} href={f.url} target="_blank" rel="noopener noreferrer" className="msg-image" title={f.fileName}>
              <img src={f.url} alt={f.fileName} loading="lazy" onError={expired} />
            </a>
          ))}
        </div>
      )}
      {videos.map((f) => (
        <video key={f.attachmentId} className="msg-video" src={f.url} controls preload="none" playsInline onError={expired}>
          <a href={downloadUrl(f.url, f.fileName)}>Tải video {f.fileName}</a>
        </video>
      ))}
      {others.map((f) => (
        <div key={f.attachmentId} className="msg-file">
          <Icon name={fileIcon(f.mimeType)} />
          <span className="msg-file-text">
            <span className="msg-file-name" title={f.fileName}>
              {f.fileName}
            </span>
            <span className="caption muted">{formatFileSize(f.sizeBytes)}</span>
          </span>
          {f.url ? (
            <a className="btn btn-icon" href={downloadUrl(f.url, f.fileName)} aria-label={`Tải xuống ${f.fileName}`} title="Tải xuống">
              <Icon name="download" size="sm" />
            </a>
          ) : (
            <button type="button" className="btn btn-icon" onClick={() => onExpired?.()} aria-label="Tải lại liên kết" title="Tải lại">
              <Icon name="refresh" size="sm" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
