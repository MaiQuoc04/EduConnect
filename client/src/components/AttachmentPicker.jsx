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
//
// Ordering (17/11/2026, FE-08 "ảnh tiêu đề"): OFF unless the form passes sortable (FE-05 / FE-06 pass nothing and
// see no change). With sortable, order (keys, see arrangeAttachments) and onOrderChange(keys):
//   - the first IMAGE of the list is labelled "Ảnh tiêu đề" (the picture of the card in the feed);
//   - every other image has "Đặt làm ảnh tiêu đề" (moves it to the top), every file has up / down buttons: works on
//     every device and with the keyboard (buttons of at least 44px on touch screens);
//   - on a mouse / trackpad (pointer: fine) a file can also be dragged (HTML5 drag-and-drop, no library), with the
//     dragged row faded and a line where it will land. Touch screens get no draggable rows, so scrolling is untouched;
//   - controls only when at least 2 files are in the list. The form sends the files in arrangeAttachments(...).live
//     order.

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

/**
 * The files of the list in the order chosen (sortable picker). Keys: 'e<attachmentId>' for an existing file,
 * 'n<id>' for an item of useAttachmentUploads. Keys missing from order (new files) go last, in the order they came.
 * live = what will be on the post (existing not removed, uploads not failed), in order; out = removed / failed (shown
 * after, not sortable). Each entry: { key, kind: 'existing' | 'new', file | item, name, mimeType }.
 */
export function arrangeAttachments({ order = [], existing = [], removedIds = new Set(), items = [] }) {
  const entries = new Map();
  for (const f of existing) {
    const key = `e${f.attachmentId}`;
    entries.set(key, { key, kind: 'existing', file: f, name: f.fileName, mimeType: f.mimeType, out: removedIds.has(f.attachmentId) });
  }
  for (const item of items) {
    const key = `n${item.id}`;
    entries.set(key, { key, kind: 'new', item, name: item.name, mimeType: item.mimeType, out: item.status === 'error' });
  }
  const known = (order ?? []).filter((key) => entries.has(key));
  const seen = new Set(known);
  const keys = [...known, ...[...entries.keys()].filter((key) => !seen.has(key))];
  const all = keys.map((key) => entries.get(key));
  return { live: all.filter((e) => !e.out), out: all.filter((e) => e.out) };
}

const isImage = (entry) => (entry.mimeType ?? '').startsWith('image/');

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
  sortable = false,
  order,
  onOrderChange,
}) {
  const id = useId();
  const [sorting, setSorting] = useState(null); // key of the row being dragged (sortable only)
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
          if (locked || sorting) return; // a row being reordered is not a file to add
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

      {sortable ? (
        <SortableList
          uploads={uploads}
          existing={existing}
          removedIds={removedIds}
          onToggleExisting={onToggleExisting}
          disabled={disabled}
          full={full}
          order={order}
          onOrderChange={onOrderChange}
          sorting={sorting}
          setSorting={setSorting}
        />
      ) : (
        (existing.length > 0 || uploads.items.length > 0) && (
          <ul className="ap-list" aria-label="Danh sách tệp đính kèm">
            {existing.map((f) => {
              const removed = removedIds.has(f.attachmentId);
              return (
                <li key={`e${f.attachmentId}`} className={`ap-item${removed ? ' is-removed' : ''}`}>
                  <ExistingRow f={f} removed={removed} full={full} disabled={disabled} onToggleExisting={onToggleExisting} />
                </li>
              );
            })}
            {uploads.items.map((item) => (
              <li key={item.id} className={`ap-item is-${item.status}`}>
                <NewRow item={item} uploads={uploads} disabled={disabled} />
              </li>
            ))}
          </ul>
        )
      )}
      {uploads.failedCount > 0 && (
        <p className="caption ap-error" role="status">
          {uploads.failedCount} tệp lỗi sẽ không được đính kèm. Hãy thử lại hoặc gỡ các tệp đó.
        </p>
      )}
    </div>
  );
}

// One existing file of the post (body + "Gỡ" / "Giữ lại"). slots = [before the thumb, under the name, before the
// button] (sortable list only); thumb = its picture (sortable list only; the plain list keeps the icon it always had).
function ExistingRow({ f, removed, full, disabled, onToggleExisting, thumb, slots = [] }) {
  return (
    <>
      {slots[0]}
      <span className="ap-thumb">{thumb ? <img src={thumb} alt="" /> : <Icon name={fileIcon(f.mimeType)} />}</span>
      <span className="ap-text">
        <span className="ap-name">{f.fileName}</span>
        <span className="caption muted">
          {formatFileSize(f.sizeBytes)} · {removed ? 'Sẽ gỡ khi lưu' : 'Đã đính kèm'}
        </span>
        {slots[1]}
      </span>
      {slots[2]}
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
    </>
  );
}

// One new file of the queue (body with its state + "Thử lại" / remove). slots as ExistingRow.
function NewRow({ item, uploads, disabled, slots = [] }) {
  return (
    <>
      {slots[0]}
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
        {slots[1]}
      </span>
      {slots[2]}
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
    </>
  );
}

// Rows can be dragged only with a fine pointer (mouse, trackpad): on a touch screen a draggable row would fight with
// scrolling, and the buttons do the same job there.
function useFinePointer() {
  const [fine, setFine] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: fine)').matches),
  );
  useEffect(() => {
    const query = window.matchMedia?.('(pointer: fine)');
    if (!query) return undefined;
    const onChange = () => setFine(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return fine;
}

// The sortable list (prop sortable): live files in the chosen order, then the removed / failed ones (not sortable).
function SortableList({
  uploads,
  existing,
  removedIds,
  onToggleExisting,
  disabled,
  full,
  order,
  onOrderChange,
  sorting,
  setSorting,
}) {
  const { live, out } = arrangeAttachments({ order, existing, removedIds, items: uploads.items });
  const finePointer = useFinePointer();
  const [drop, setDrop] = useState(null); // { key, after }: where the dragged row will land
  const [said, setSaid] = useState(''); // what the last move did, for screen readers
  const refocus = useRef(null); // { key, action }: the button to focus again after a move (its row moved in the DOM)
  const listRef = useRef(null);
  const canSort = live.length >= 2 && !disabled;
  const canDrag = canSort && finePointer;
  const cover = live.find(isImage);

  useEffect(() => {
    const want = refocus.current;
    if (!want || !listRef.current) return;
    refocus.current = null;
    const row = listRef.current.querySelector(`[data-key="${want.key}"]`);
    const target =
      row?.querySelector(`[data-act="${want.action}"]:not(:disabled)`) ?? row?.querySelector('.ap-sort button:not(:disabled)');
    target?.focus();
  });

  if (!live.length && !out.length) return null;

  function moveTo(key, index, action) {
    const keys = live.map((e) => e.key).filter((k) => k !== key);
    const at = Math.max(0, Math.min(index, keys.length));
    keys.splice(at, 0, key);
    onOrderChange?.([...keys, ...out.map((e) => e.key)]);
    const byKey = new Map(live.map((e) => [e.key, e]));
    const nextCover = keys.map((k) => byKey.get(k)).find(isImage);
    setSaid(
      `Đã chuyển “${byKey.get(key).name}” tới vị trí ${at + 1}/${keys.length}.` +
        (nextCover && nextCover.key !== cover?.key ? ` Ảnh tiêu đề: “${nextCover.name}”.` : ''),
    );
    if (action) refocus.current = { key, action };
  }

  function endDrag() {
    setSorting(null);
    setDrop(null);
  }

  function dropHere(e) {
    if (!sorting) return;
    e.preventDefault();
    if (drop && drop.key !== sorting) {
      const keys = live.map((x) => x.key).filter((k) => k !== sorting);
      const index = keys.indexOf(drop.key) + (drop.after ? 1 : 0);
      moveTo(sorting, index);
    }
    endDrag();
  }

  return (
    <>
      {live.length >= 2 && (
        <p className="caption muted ap-sort-help">
          {live.some(isImage) ? 'Ảnh đầu tiên trong danh sách là ảnh tiêu đề, hiện trên thẻ bài ngoài bảng tin. ' : ''}
          {finePointer ? 'Kéo thả hoặc dùng các nút mũi tên để đổi thứ tự.' : 'Dùng các nút mũi tên để đổi thứ tự.'}
        </p>
      )}
      <ul
        ref={listRef}
        className={`ap-list${sorting ? ' is-sorting' : ''}`}
        aria-label="Danh sách tệp đính kèm"
        onDragOver={(e) => {
          if (sorting) e.preventDefault();
        }}
        onDrop={dropHere}
      >
        {live.map((entry, index) => {
          const isCover = entry === cover;
          const landing = drop && drop.key === entry.key && drop.key !== sorting;
          const handle = canDrag ? (
            <span className="ap-handle" aria-hidden="true" title="Kéo để đổi thứ tự">
              <Icon name="drag_indicator" size="sm" />
            </span>
          ) : null;
          const label = isCover ? (
            <span className="ap-cover">
              <Icon name="image" size="sm" />
              Ảnh tiêu đề
            </span>
          ) : null;
          const controls = canSort ? (
            <span className="ap-sort">
              {isImage(entry) && !isCover && (
                <button
                  type="button"
                  className="btn btn-tertiary ap-sort-cover"
                  data-act="cover"
                  onClick={() => moveTo(entry.key, 0, 'down')}
                  aria-label={`Đặt “${entry.name}” làm ảnh tiêu đề`}
                >
                  <Icon name="star" size="sm" />
                  <span>Đặt làm ảnh tiêu đề</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-tertiary ap-sort-step"
                data-act="up"
                onClick={() => moveTo(entry.key, index - 1, 'up')}
                disabled={index === 0}
                aria-label={`Đưa “${entry.name}” lên`}
                title="Đưa lên"
              >
                <Icon name="arrow_upward" size="sm" />
              </button>
              <button
                type="button"
                className="btn btn-tertiary ap-sort-step"
                data-act="down"
                onClick={() => moveTo(entry.key, index + 1, 'down')}
                disabled={index === live.length - 1}
                aria-label={`Đưa “${entry.name}” xuống`}
                title="Đưa xuống"
              >
                <Icon name="arrow_downward" size="sm" />
              </button>
            </span>
          ) : null;
          const className =
            `ap-item ap-sortable${entry.kind === 'new' ? ` is-${entry.item.status}` : ''}${isCover ? ' is-cover' : ''}` +
            `${sorting === entry.key ? ' is-dragged' : ''}${landing ? (drop.after ? ' is-drop-after' : ' is-drop-before') : ''}`;
          const dragProps = canDrag
            ? {
                draggable: true,
                onDragStart: (e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', entry.name); // Firefox starts a drag only with some data
                  setSorting(entry.key);
                },
                onDragOver: (e) => {
                  if (!sorting) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const box = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > box.top + box.height / 2;
                  if (drop?.key !== entry.key || drop.after !== after) setDrop({ key: entry.key, after });
                },
                onDragEnd: endDrag,
              }
            : {};
          const slots = [handle, label, controls];
          return (
            <li key={entry.key} data-key={entry.key} className={className} {...dragProps}>
              {entry.kind === 'existing' ? (
                <ExistingRow
                  f={entry.file}
                  removed={false}
                  full={full}
                  disabled={disabled}
                  onToggleExisting={onToggleExisting}
                  thumb={isImage(entry) ? entry.file.url : null}
                  slots={slots}
                />
              ) : (
                <NewRow item={entry.item} uploads={uploads} disabled={disabled} slots={slots} />
              )}
            </li>
          );
        })}
        {out.map((entry) => (
          <li
            key={entry.key}
            data-key={entry.key}
            className={entry.kind === 'existing' ? 'ap-item is-removed' : `ap-item is-${entry.item.status}`}
          >
            {entry.kind === 'existing' ? (
              <ExistingRow f={entry.file} removed full={full} disabled={disabled} onToggleExisting={onToggleExisting} />
            ) : (
              <NewRow item={entry.item} uploads={uploads} disabled={disabled} />
            )}
          </li>
        ))}
      </ul>
      <span className="ap-said" role="status" aria-live="polite">
        {said}
      </span>
    </>
  );
}
