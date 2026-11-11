import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { createGroupPost, getGroupPost, listGroupPosts, updateGroupPost } from '../../api/groupPosts.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { LeaveDialog, useLeaveGuard } from '../schoolfeed/leaveGuard.jsx';
import { feedPath, MAX_POST_LENGTH, moderatorName, postLength, postPath } from './groupFeedShared.jsx';

// SCR-36 Create Group Post (UC-38) and SCR-38 Update Group Post (UC-39): one form, `postId` in the URL = edit.
// Asks before leaving with unsaved text (FE-08 leave guard). What happens to the post after saving follows
// business-rules §5 and is said before saving: approval on → the post waits for the moderator (also an approved
// post that is edited, and a rejected one that is sent again).

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
  const [original, setOriginal] = useState(editing ? null : '');
  const [post, setPost] = useState(null);
  const [moderator, setModerator] = useState(false);
  const [text, setText] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);

  const back = editing && location.state?.from === 'detail' ? postPath(g.groupId, postId) : feedPath(g.groupId);

  // Edit: the post as it is now. Create: whether the viewer moderates (their post is approved at once).
  useEffect(() => {
    const controller = new AbortController();
    if (editing) {
      getGroupPost(postId, { signal: controller.signal })
        .then((p) => {
          if (!p.can.edit) {
            setLoadError(p.isHidden ? errorText({ code: 'MSG_POST_HIDDEN' }) : errorText({ code: 'FORBIDDEN' }));
            return;
          }
          setPost(p);
          setModerator(p.group.isModerator);
          setOriginal(p.content);
          setText(p.content);
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
  const dirty = original !== null && text.normalize('NFC').trim() !== original;
  const { asking, setAsking, stay, leave } = useLeaveGuard(dirty);

  const length = postLength(text);
  const tooLong = length > MAX_POST_LENGTH;
  const empty = length === 0;
  const unchanged = editing && original !== null && text.normalize('NFC').trim() === original;
  const willWait = g.requireApproval && !moderator;
  const who = moderatorName(g.groupType);

  async function submit(e) {
    e.preventDefault();
    if (sending.current || empty || tooLong || unchanged) return;
    sending.current = true;
    setSaving(true);
    setError('');
    const content = text.normalize('NFC').trim();
    try {
      const saved = editing ? await updateGroupPost(postId, content) : await createGroupPost(g.groupId, content);
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

  function cancel() {
    if (dirty) setAsking({ cancel: true });
    else leave(() => navigate(back));
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

      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || empty || tooLong || unchanged}>
          <Icon name="send" size="sm" />
          {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : willWait ? 'Gửi duyệt' : 'Đăng bài'}
        </button>
      </div>
      <LeaveDialog open={Boolean(asking)} onStay={stay} onLeave={confirmLeave} />
    </form>
  );
}
