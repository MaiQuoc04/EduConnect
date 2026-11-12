import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  createGroupPost,
  getGroupPost,
  getPostAttachmentLimits,
  listGroupPosts,
  updateGroupPost,
} from '../../api/groupPosts.js';
import { UPLOAD_TARGETS } from '../../api/uploads.js';
import AttachmentPicker, { useAttachmentUploads } from '../../components/AttachmentPicker.jsx';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import ConfirmDialog from '../groups/ConfirmDialog.jsx';
import { LeaveDialog, useLeaveGuard } from '../schoolfeed/leaveGuard.jsx';
import { feedPath, MAX_POST_LENGTH, moderatorName, postLength, postPath } from './groupFeedShared.jsx';
import { clearDraft, readDraft, writeDraft } from './postDraft.js';

// SCR-36 Create Group Post (UC-38) and SCR-38 Update Group Post (UC-39): one form, `postId` in the URL = edit.
// Asks before leaving with unsaved text (FE-08 leave guard). What happens to the post after saving follows
// business-rules §5 and is said before saving: approval on → the post waits for the moderator (also an approved
// post that is edited, and a rejected one that is sent again).
// Files (12/11/2026): the shared FE-08 AttachmentPicker uploads each file straight to storage (target 'post', images
// compressed first) while the text is written; saving waits until every file is up. Editing: files of the post can be
// taken off (soft deleted on save) and new ones added; a change of files is an edit like a change of text.
// Draft (12/11/2026, new posts only): the text and the files already uploaded are saved in this browser while typing
// (postDraft.js), so leaving the form loses nothing; coming back restores them. Only a file still uploading would be
// lost, so the leave guard asks only then. The draft is removed when the post is sent or "Huỷ" → "Bỏ bản nháp".
// Editing an existing post keeps the old behaviour (asks before leaving with unsaved changes).

const DRAFT_SAVE_DELAY = 400; // ms after the last keystroke
const draftFileId = (f) => `draft:${f.storageKey}`;

// "10:32" today, "10:32, 11/11" another day.
function savedTime(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${time}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

const UPLOADING_HINT = 'Đang tải tệp đính kèm lên. Vui lòng chờ tải xong.';

// Limits of the file picker, read from the server (system_settings), never hard-coded. { limits, error, reload }.
function useFileLimits() {
  const [state, setState] = useState({ limits: null, error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ limits: null, error: '' });
    getPostAttachmentLimits({ signal: controller.signal })
      .then((limits) => setState({ limits, error: '' }))
      .catch((err) => !controller.signal.aborted && setState({ limits: null, error: errorText(err) }));
    return () => controller.abort();
  }, [version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

const COUNTER_FROM = 4500; // the "characters left" counter shows when this close to the limit

export default function GroupPostFormPage() {
  const g = useOutletContext();
  const { postId } = useParams();
  const editing = Boolean(postId);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const fieldId = useId();
  // The draft found when the form opened (create only), read once.
  const [restored] = useState(() => (editing ? null : readDraft(user?.id, g.groupId)));
  const [original, setOriginal] = useState(editing ? null : '');
  const [post, setPost] = useState(null);
  const [moderator, setModerator] = useState(false);
  const [text, setText] = useState(restored?.text ?? '');
  const [draftFiles, setDraftFiles] = useState(restored?.files ?? []); // uploaded earlier, kept by the draft
  const [savedAt, setSavedAt] = useState(restored?.savedAt ?? null);
  const [showRestored, setShowRestored] = useState(Boolean(restored));
  const [discarding, setDiscarding] = useState(false);
  const finished = useRef(false); // sent or discarded: the draft must not be written again
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [existingFiles, setExistingFiles] = useState([]); // files the post has (edit)
  const [removedIds, setRemovedIds] = useState(() => new Set());
  const sending = useRef(false);
  const fileLimits = useFileLimits();
  const uploads = useAttachmentUploads({
    target: UPLOAD_TARGETS.GROUP_POST,
    limits: fileLimits.limits,
    existingCount: existingFiles.length - removedIds.size + draftFiles.length,
  });

  // Draft autosave (create only): a short delay after each change, and at once when the page is left or hidden.
  const draftJson = editing ? null : JSON.stringify({ text, files: [...draftFiles, ...uploads.uploaded] });
  const pendingDraft = useRef(null);
  const saveDraft = useCallback(() => {
    if (finished.current || pendingDraft.current === null) return;
    const at = writeDraft(user?.id, g.groupId, JSON.parse(pendingDraft.current));
    pendingDraft.current = null;
    setSavedAt(at);
  }, [user?.id, g.groupId]);
  useEffect(() => {
    if (draftJson === null) return undefined;
    pendingDraft.current = draftJson;
    const timer = setTimeout(saveDraft, DRAFT_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [draftJson, saveDraft]);
  useEffect(() => {
    if (editing) return undefined;
    window.addEventListener('pagehide', saveDraft);
    return () => {
      window.removeEventListener('pagehide', saveDraft);
      saveDraft(); // leaving the form inside the app
    };
  }, [editing, saveDraft]);

  const back = editing && location.state?.from === 'detail' ? postPath(g.groupId, postId) : feedPath(g.groupId);

  // Edit: the post as it is now. Create: whether the viewer moderates (their post is approved at once).
  useEffect(() => {
    const controller = new AbortController();
    if (editing) {
      getGroupPost(postId, { signal: controller.signal })
        .then((p) => {
          if (!p.can.edit) {
            setLoadError(errorText({ code: 'FORBIDDEN' }));
            return;
          }
          setPost(p);
          setModerator(p.group.isModerator);
          setOriginal(p.content);
          setText(p.content);
          setExistingFiles(p.attachments ?? []);
        })
        .catch((err) => !controller.signal.aborted && setLoadError(errorText(err)));
    } else {
      listGroupPosts(g.groupId, { view: 'feed', page: 1, pageSize: 1 }, { signal: controller.signal })
        .then((data) => setModerator(data.group.isModerator))
        .catch(() => {}); // only the hint depends on it
    }
    return () => controller.abort();
  }, [editing, postId, g.groupId]);

  // Stays true while saving: leave() then removes the guard's extra history entry itself before navigating.
  // Edit: any unsaved change. Create: the draft keeps text and uploaded files, so only a file still uploading is at risk.
  const filesChanged = uploads.items.length > 0 || removedIds.size > 0;
  const dirty = editing
    ? original !== null && (text.normalize('NFC').trim() !== original || filesChanged)
    : uploads.busy;
  const hasDraft = !editing && (text.trim() !== '' || draftFiles.length > 0 || uploads.items.length > 0);
  const { asking, setAsking, stay, leave } = useLeaveGuard(dirty);

  const length = postLength(text);
  const tooLong = length > MAX_POST_LENGTH;
  const empty = length === 0;
  const unchanged =
    editing && original !== null && text.normalize('NFC').trim() === original && !uploads.uploaded.length && !removedIds.size;
  // A hidden post always goes back to the moderator when edited, even with approval off (§5, 12/11/2026).
  const willWait = !moderator && (g.requireApproval || Boolean(post?.isHidden));
  const resend = editing && (post?.isHidden || post?.approvalStatus === 'REJECTED');
  const who = moderatorName(g.groupType);

  async function submit(e) {
    e.preventDefault();
    if (sending.current || empty || tooLong || unchanged || uploads.busy) return;
    sending.current = true;
    setSaving(true);
    setError('');
    const content = text.normalize('NFC').trim();
    try {
      // Files that failed to upload are left out (the picker shows them with their error).
      const saved = editing
        ? await updateGroupPost(postId, content, { attachments: uploads.uploaded, removeAttachmentIds: [...removedIds] })
        : await createGroupPost(g.groupId, content, [...draftFiles, ...uploads.uploaded]);
      if (!editing) {
        finished.current = true;
        clearDraft(user?.id, g.groupId);
      }
      const pending = saved.approvalStatus === 'PENDING';
      toast(
        pending
          ? `Đã gửi bài. Bài sẽ hiện trên bảng tin sau khi ${who} duyệt.`
          : editing
            ? 'Đã lưu bài viết.'
            : 'Đã đăng bài viết.',
      );
      leave(() => navigate(pending ? feedPath(g.groupId) : postPath(g.groupId, saved.postId), { replace: true }));
    } catch (err) {
      sending.current = false;
      setSaving(false);
      setError(errorText(err));
    }
  }

  function toggleExisting(attachmentId) {
    if (String(attachmentId).startsWith('draft:')) {
      // A file of the draft is not on any post yet: taking it off simply drops it from the draft.
      setDraftFiles((list) => list.filter((f) => draftFileId(f) !== attachmentId));
      return;
    }
    setRemovedIds((set) => {
      const next = new Set(set);
      if (next.has(attachmentId)) next.delete(attachmentId);
      else next.add(attachmentId);
      return next;
    });
  }

  function cancel() {
    if (!editing && hasDraft) setDiscarding(true); // "Huỷ" on a new post = throw the draft away (asked first)
    else if (dirty) setAsking({ cancel: true });
    else leave(() => navigate(back));
  }

  // Throws the draft away: "Bỏ bản nháp" of the restored notice (stay on the form) or "Huỷ" confirmed (leave).
  function discardDraft({ thenLeave }) {
    clearDraft(user?.id, g.groupId);
    pendingDraft.current = null;
    setShowRestored(false);
    setSavedAt(null);
    if (thenLeave) {
      finished.current = true;
      leave(() => navigate(back));
      return;
    }
    setText('');
    setDraftFiles([]);
    uploads.items.forEach((item) => uploads.remove(item.id));
  }

  function confirmLeave() {
    const target = asking;
    setAsking(null);
    if (target?.to) leave(() => navigate(target.to));
    else if (target?.back) leave(null, 1);
    else leave(() => navigate(back));
  }

  if (loadError) {
    return (
      <div className="card card-outline gf-empty">
        <Icon name="edit_off" />
        <p className="muted">{loadError}</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(back)}>
          Quay lại
        </button>
      </div>
    );
  }
  if (g.readOnly) {
    return (
      <div className="notice">
        <Icon name="history" />
        <p>{errorText({ code: 'MSG_GROUP_READ_ONLY' })}</p>
      </div>
    );
  }
  if (original === null) return <p className="loading">Đang tải bài viết…</p>;

  const notice = !willWait
    ? null
    : !editing
      ? `Nhóm đang bật duyệt bài: bài của bạn sẽ hiện trên bảng tin sau khi ${who} duyệt.`
      : post?.isHidden
        ? `Bài đang bị ẩn. Sau khi lưu, bài sẽ được gửi để ${who} duyệt lại và chỉ hiện lại trên bảng tin khi được duyệt.`
        : post?.approvalStatus === 'REJECTED'
        ? `Sau khi lưu, bài sẽ được gửi để ${who} duyệt lại.`
        : post?.approvalStatus === 'APPROVED'
          ? `Sau khi lưu, bài sẽ tạm rời bảng tin cho đến khi ${who} duyệt lại.`
          : null;

  return (
    <form className="card card-outline gf-form" onSubmit={submit} noValidate>
      <h2 className="title-md gf-form-title">
        <Icon name={editing ? 'edit' : 'edit_square'} />
        {editing ? 'Sửa bài viết' : 'Tạo bài viết'}
      </h2>

      <div className="gf-form-who">
        <Avatar src={user?.avatarUrl} name={user?.fullName ?? ''} size={36} />
        <span>
          <strong>{user?.fullName}</strong>
          <span className="caption muted"> đăng trong {g.title}</span>
        </span>
      </div>

      {showRestored && (
        <div className="notice gf-draft-notice" role="status">
          <Icon name="history" />
          <p>Đã khôi phục bản nháp bạn soạn lúc {savedTime(restored.savedAt)}.</p>
          <button type="button" className="btn btn-tertiary btn-sm" onClick={() => discardDraft({ thenLeave: false })}>
            Bỏ bản nháp
          </button>
        </div>
      )}

      {notice && (
        <div className="notice amber">
          <Icon name="verified" />
          <p>{notice}</p>
        </div>
      )}

      <div className={`field${tooLong || error ? ' invalid' : ''}`}>
        <label htmlFor={fieldId} className="field-label">
          Nội dung
          {length >= COUNTER_FROM && (
            <span className={`caption mono${tooLong ? ' gf-over' : ''}`} aria-live="polite">
              {length.toLocaleString('vi-VN')}/{MAX_POST_LENGTH.toLocaleString('vi-VN')}
            </span>
          )}
        </label>
        <textarea
          id={fieldId}
          className="input gf-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Enter posts, Shift + Enter breaks the line (as the chat and the comments); never while an input method
          // (Vietnamese Telex / VNI) is still composing a letter.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
          placeholder="Bạn muốn chia sẻ điều gì với nhóm?"
          rows={8}
          autoFocus
          disabled={saving}
          aria-invalid={tooLong || Boolean(error)}
        />
        {tooLong ? (
          <span className="field-error">Nội dung tối đa {MAX_POST_LENGTH.toLocaleString('vi-VN')} ký tự.</span>
        ) : (
          <span className="field-help">Enter để đăng, Shift + Enter để xuống dòng.</span>
        )}
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>

      <AttachmentPicker
        uploads={uploads}
        limits={fileLimits.limits}
        limitsError={fileLimits.error}
        onReloadLimits={fileLimits.reload}
        existing={editing ? existingFiles : draftFiles.map((f) => ({ ...f, attachmentId: draftFileId(f) }))}
        removedIds={removedIds}
        onToggleExisting={toggleExisting}
        disabled={saving}
      />

      <div className="card-footer">
        {uploads.busy ? (
          <span className="caption muted gf-form-status">
            <Icon name="cloud_upload" size="sm" />
            {UPLOADING_HINT}
          </span>
        ) : (
          !editing &&
          savedAt && (
            <span className="caption muted gf-form-status" aria-live="polite">
              <Icon name="cloud_done" size="sm" />
              Đã lưu nháp lúc {savedTime(savedAt)}
            </span>
          )
        )}
        <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>
          Huỷ
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || empty || tooLong || unchanged || uploads.busy}
          title={uploads.busy ? UPLOADING_HINT : undefined}
        >
          <Icon name="send" size="sm" />
          {saving
            ? 'Đang lưu…'
            : editing
              ? resend && willWait
                ? 'Gửi duyệt lại'
                : 'Lưu thay đổi'
              : willWait
                ? 'Gửi duyệt'
                : 'Đăng bài'}
        </button>
      </div>
      <LeaveDialog open={Boolean(asking)} onStay={stay} onLeave={confirmLeave} />
      {discarding && (
        <ConfirmDialog
          title="Bỏ bài đang soạn?"
          confirmLabel="Bỏ bản nháp"
          busyLabel="Đang xoá…"
          icon="delete"
          onCancel={() => setDiscarding(false)}
          onConfirm={async () => discardDraft({ thenLeave: true })}
        >
          Nội dung và các tệp đã chọn sẽ bị xoá. Nếu chỉ muốn tạm rời đi, bạn cứ chuyển sang trang khác: bản nháp vẫn được
          giữ lại.
        </ConfirmDialog>
      )}
    </form>
  );
}
