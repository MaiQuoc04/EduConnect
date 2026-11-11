import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { uploadFile } from '../api/uploads.js';
import { errorText } from '../messages.js';
import { formatFileSize } from '../utils/format.js';
import { compressImageDetailed, MAX_SOURCE_MB, POST_IMAGE } from '../utils/imageCompress.js';
import Icon from './Icon.jsx';
import './AttachmentPicker.css';

// Choosing and uploading the attachments of a post or a message – shared by FE-08 School Feed (SCR-31 / SCR-06) and,
// later, FE-05 Group Feed and FE-06 Messaging (Khanh). Two pieces:
//   useAttachmentUploads({ target, groupId, limits, existingCount })  the queue: check → compress images → upload
//   <AttachmentPicker uploads={…} limits={…} />                       the "Chọn tệp" box and the list of files
// `limits` = { maxFiles, maxFileMb, maxVideoMb, types: [{ mimeType, kind: 'image' | 'video' | 'document',
// extensions }] }, read from the server (FE-08: GET /school-posts/attachment-limits), never hard-coded.
// What to send with the post: uploads.uploaded (the /uploads/confirm answers, in the order of the list).

const MB = 1024 * 1024;
// Images the browser can shrink (imageCompress). GIF is sent as it is: redrawing it would lose the animation.
const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp'];
const BUSY = ['compressing', 'uploading'];

let nextId = 1;

/** Icon of a file by its MIME type (Material Symbols). Also used by AttachmentList. */
export function fileIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'movie';
  if (mimeType === 'application/pdf') return 'picture_as_pdf';
  if (/spreadsheet|ms-excel|csv/.test(mimeType)) return 'table_chart';
  if (/presentation|powerpoint/.test(mimeType)) return 'slideshow';
  return 'description';
}

/** The size rule of one type: { kind, maxMb } or null when the type is not allowed (business-rules §5, §13). */
export function ruleOf(limits, mimeType) {
  const type = limits?.types?.find((t) => t.mimeType === mimeType);
  if (!type) return null;
  return { kind: type.kind, maxMb: type.kind === 'video' ? limits.maxVideoMb : limits.maxFileMb };
}

/**
 * The upload queue of one form. Files are handled one after the other (one big image decoded at a time on a phone)
 * in the order they were chosen; that order is the order sent to the server.
 * Checked BEFORE anything is sent (so /uploads/sign is never called for them): the type is one of limits.types, the
 * size is within the limit of its kind, the count stays within limits.maxFiles (existingCount = files the post
 * already has). Images are checked again AFTER compression (the original may be bigger than the limit; only the
 * compressed copy is uploaded – the original only has the MAX_SOURCE_MB ceiling).
 * Removing a file that is uploading cancels it; removing one already uploaded only drops it from the list: its object
 * stays in tmp/ or in its folder until scripts/clean-orphan-uploads.js (there is no endpoint to delete an upload).
 */
export function useAttachmentUploads({ target, groupId, limits, existingCount = 0 }) {
  const [items, setItems] = useState([]);
  const files = useRef(new Map()); // id -> { file, controller, previewUrl }
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const stored = files.current;
    return () => {
      alive.current = false;
      for (const entry of stored.values()) {
        entry.controller?.abort();
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      }
    };
  }, []);

  const patch = useCallback((id, changes) => {
    if (!alive.current) return;
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const run = useCallback(
    async (id) => {
      const entry = files.current.get(id);
      if (!entry) return; // removed while waiting
      const original = entry.file;
      const rule = ruleOf(limits, original.type);
      let file = original;
      try {
        if (COMPRESSIBLE.includes(original.type)) {
          patch(id, { status: 'compressing', error: '' });
          const result = await compressImageDetailed(original, POST_IMAGE);
          if (!files.current.has(id)) return;
          if (result.status === 'unreadable') {
            patch(id, { status: 'error', error: 'Không đọc được ảnh này. Vui lòng chọn ảnh khác.', retryable: false });
            return;
          }
          file = result.file;
          if (file.type.startsWith('image/')) {
            if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
            entry.previewUrl = URL.createObjectURL(file);
          }
          patch(id, { size: file.size, name: file.name, mimeType: file.type, previewUrl: entry.previewUrl });
        }
        if (file.size > rule.maxMb * MB) {
          patch(id, { status: 'error', error: `Tệp vượt quá ${rule.maxMb} MB, kể cả sau khi thu nhỏ.`, retryable: false });
          return;
        }
        entry.controller = new AbortController();
        patch(id, { status: 'uploading', progress: 0, error: '' });
        const uploaded = await uploadFile(file, {
          target,
          groupId,
          signal: entry.controller.signal,
          onProgress: (progress) => patch(id, { progress }),
        });
        if (!files.current.has(id)) return; // removed during the last step: dropped (orphan, see above)
        patch(id, { status: 'done', progress: 1, result: uploaded });
      } catch (err) {
        if (!files.current.has(id) || err?.code === 'CANCELLED') return;
        patch(id, { status: 'error', error: errorText(err), retryable: true });
      }
    },
    [limits, target, groupId, patch],
  );

  const enqueue = useCallback(
    (id) => {
      queue.current = queue.current.then(() => run(id)).catch(() => {});
    },
    [run],
  );

  // Adds the chosen files; returns a message for files that were not added at all (over the count), or ''.
  const add = useCallback(
    (fileList) => {
      const chosen = [...(fileList ?? [])];
      if (!chosen.length || !limits) return '';
      const room = Math.max(0, limits.maxFiles - existingCount - items.length);
      const taken = chosen.slice(0, room);
      const added = taken.map((file) => {
        const id = nextId++;
        const rule = ruleOf(limits, file.type);
        const base = { id, name: file.name, mimeType: file.type, originalSize: file.size, size: file.size, progress: 0 };
        let error = '';
        if (!rule) error = 'Loại tệp này không được phép đính kèm.';
        else if (COMPRESSIBLE.includes(file.type) && file.size > MAX_SOURCE_MB * MB) {
          error = `Ảnh gốc quá lớn để xử lý (tối đa ${MAX_SOURCE_MB} MB).`;
        } else if (!COMPRESSIBLE.includes(file.type) && file.size > rule.maxMb * MB) {
          error = `${rule.kind === 'video' ? 'Video' : 'Tệp'} vượt quá dung lượng cho phép (tối đa ${rule.maxMb} MB).`;
        }
        if (error) return { ...base, status: 'error', error, retryable: false };
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
        files.current.set(id, { file, previewUrl });
        return { ...base, status: 'waiting', previewUrl };
      });
      setItems((list) => [...list, ...added]);
      for (const item of added) if (item.status === 'waiting') enqueue(item.id);
      const left = chosen.length - taken.length;
      return left > 0 ? `Mỗi bài có tối đa ${limits.maxFiles} tệp, nên ${left} tệp không được thêm.` : '';
    },
    [limits, existingCount, items.length, enqueue],
  );

  const remove = useCallback((id) => {
    const entry = files.current.get(id);
    if (entry) {
      entry.controller?.abort();
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      files.current.delete(id);
    }
    setItems((list) => list.filter((item) => item.id !== id));
  }, []);

  const retry = useCallback(
    (id) => {
      if (!files.current.has(id)) return;
      patch(id, { status: 'waiting', error: '', progress: 0 });
      enqueue(id);
    },
    [patch, enqueue],
  );

  const busy = items.some((item) => item.status === 'waiting' || BUSY.includes(item.status));
  return {
    items,
    add,
    remove,
    retry,
    busy,
    failedCount: items.filter((item) => item.status === 'error').length,
    uploaded: items.filter((item) => item.status === 'done').map((item) => item.result),
  };
}

function statusText(item) {
  switch (item.status) {
    case 'waiting':
      return 'Đang chờ…';
    case 'compressing':
      return 'Đang thu nhỏ ảnh…';
    case 'uploading':
      return `Đang tải lên ${Math.round((item.progress ?? 0) * 100)}%`;
    case 'done':
      return 'Đã tải lên';
    default:
      return item.error;
  }
}

function sizeText(item) {
  if (item.size !== item.originalSize && item.status !== 'error') {
    return `${formatFileSize(item.originalSize)} → ${formatFileSize(item.size)}`;
  }
  return formatFileSize(item.originalSize);
}

/**
 * The "Chọn tệp" box (several files at once, or dropped on it) and the list: existing files of the post first (SCR-06,
 * each can be taken off and put back before saving), then the new ones with their state (waiting → compressing →
 * uploading % → done, or the error with "Thử lại" when sending can be tried again) and a remove button.
 * Props: uploads (useAttachmentUploads), limits (null while loading), limitsError + onReloadLimits, existing
 * ([{ attachmentId, fileName, mimeType, sizeBytes }]), removedIds (Set), onToggleExisting(id), disabled, label.
 */
export default function AttachmentPicker({
  uploads,
  limits,
  limitsError,
  onReloadLimits,
  existing = [],
  removedIds = new Set(),
  onToggleExisting,
  disabled,
  label = 'Tệp đính kèm',
}) {
  const id = useId();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const kept = existing.filter((f) => !removedIds.has(f.attachmentId)).length;
  const full = limits ? kept + uploads.items.length >= limits.maxFiles : true;
  const locked = disabled || !limits || full;

  const accept = limits?.types.flatMap((t) => [t.mimeType, ...t.extensions]).join(',') ?? '';
  const pick = (list) => setNotice(uploads.add(list));

  return (
    <div className="field attachment-picker">
      <span className="field-label" id={`${id}-label`}>
        {label}
        {limits && (
          <span className="caption muted">
            {kept + uploads.items.length}/{limits.maxFiles}
          </span>
        )}
      </span>
      <div
        className={`ap-drop${dragging ? ' is-dragging' : ''}${locked ? ' is-locked' : ''}`}
        onDragOver={(e) => {
          if (locked) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!locked) pick(e.dataTransfer.files);
        }}
      >
        <button
          type="button"
          className="btn btn-secondary ap-choose"
          onClick={() => inputRef.current?.click()}
          disabled={locked}
          aria-describedby={`${id}-help`}
        >
          <Icon name="attach_file" size="sm" />
          Chọn tệp
        </button>
        <span id={`${id}-help`} className="caption muted ap-help">
          {limitsError
            ? 'Không tải được giới hạn tệp.'
            : !limits
              ? 'Đang tải giới hạn tệp…'
              : full
                ? `Đã đủ ${limits.maxFiles} tệp. Gỡ bớt một tệp để thêm tệp khác.`
                : `Ảnh, video, PDF, Word, Excel, PowerPoint hoặc CSV; có thể chọn nhiều tệp hoặc kéo thả vào đây. Ảnh và tài liệu tối đa ${limits.maxFileMb} MB, video tối đa ${limits.maxVideoMb} MB. Ảnh được tự thu nhỏ trước khi tải lên.`}
        </span>
        {limitsError && onReloadLimits && (
          <button type="button" className="btn btn-tertiary" onClick={onReloadLimits}>
            <Icon name="refresh" size="sm" />
            Thử lại
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={accept}
          aria-labelledby={`${id}-label`}
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {notice && (
        <p className="caption ap-notice" role="status">
          {notice}
        </p>
      )}

      {(existing.length > 0 || uploads.items.length > 0) && (
        <ul className="ap-list" aria-label="Danh sách tệp đính kèm">
          {existing.map((f) => {
            const removed = removedIds.has(f.attachmentId);
            return (
              <li key={`e${f.attachmentId}`} className={`ap-item${removed ? ' is-removed' : ''}`}>
                <span className="ap-thumb">
                  <Icon name={fileIcon(f.mimeType)} />
                </span>
                <span className="ap-text">
                  <span className="ap-name">{f.fileName}</span>
                  <span className="caption muted">
                    {formatFileSize(f.sizeBytes)} · {removed ? 'Sẽ gỡ khi lưu' : 'Đã đính kèm'}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-tertiary ap-action"
                  onClick={() => onToggleExisting?.(f.attachmentId)}
                  disabled={disabled || (removed && full)}
                  aria-label={removed ? `Giữ lại ${f.fileName}` : `Gỡ ${f.fileName}`}
                >
                  <Icon name={removed ? 'undo' : 'close'} size="sm" />
                  {removed ? 'Giữ lại' : 'Gỡ'}
                </button>
              </li>
            );
          })}
          {uploads.items.map((item) => (
            <li key={item.id} className={`ap-item is-${item.status}`}>
              <span className="ap-thumb">
                {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <Icon name={fileIcon(item.mimeType)} />}
              </span>
              <span className="ap-text">
                <span className="ap-name">{item.name}</span>
                <span className="caption ap-status" aria-live="polite">
                  <span className="mono">{sizeText(item)}</span>
                  <span aria-hidden="true"> · </span>
                  <span className={item.status === 'error' ? 'ap-error' : 'muted'}>{statusText(item)}</span>
                </span>
                {item.status === 'uploading' && (
                  <span className="ap-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round((item.progress ?? 0) * 100)}%` }} />
                  </span>
                )}
              </span>
              {item.status === 'error' && item.retryable && (
                <button type="button" className="btn btn-tertiary ap-action" onClick={() => uploads.retry(item.id)} disabled={disabled}>
                  <Icon name="refresh" size="sm" />
                  Thử lại
                </button>
              )}
              <button
                type="button"
                className="btn btn-tertiary ap-action ap-remove"
                onClick={() => uploads.remove(item.id)}
                disabled={disabled}
                aria-label={`Gỡ ${item.name}`}
                title="Gỡ tệp"
              >
                <Icon name="close" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {uploads.failedCount > 0 && (
        <p className="caption ap-error" role="status">
          {uploads.failedCount} tệp lỗi sẽ không được đính kèm. Hãy thử lại hoặc gỡ các tệp đó.
        </p>
      )}
    </div>
  );
}
