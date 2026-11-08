import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createSchoolPost } from '../../api/schoolPosts.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { LeaveDialog, useLeaveGuard } from './leaveGuard.jsx';
import { handOverPost } from './schoolFeedShared.jsx';
import {
  audienceLabels,
  AudiencePicker,
  ConfirmPostDialog,
  DEFAULT_SEND_NOTIFICATION,
  emptyAudience,
  isAudienceEmpty,
  normalizeContent,
  normalizeTitle,
  POST_TYPE_INFO,
  PostPreview,
  PostTypeSwitch,
  saveErrorOf,
  TitleCounter,
  useAudienceOptions,
  validatePost,
} from './schoolPostForm.jsx';

// SCR-31 Create School Post (FE-08, owner Anh): UC-60, School Manager only (permissions.md "School post – Create";
// the route is wrapped in ProtectedRoute and the server checks the active role).
// Design: Stitch "SCR-36 Create School Post". Not built here:
//   - attachments and cover image: the storage provider is not decided (business-rules §15);
//   - pinning on create: pinning is its own action (UC-63, on the detail page and the feed).

const FEED_PATH = '/school-feed';
const SAVE_ERROR = 'Không đăng được bài viết. Vui lòng thử lại.';
const FIELD_ORDER = ['title', 'content', 'audience'];
const FIELD_FOCUS = { title: 'spf-title', content: 'spf-content', audience: 'spf-audience' };

const INITIAL = { postType: 'ANNOUNCEMENT', title: '', content: '', sendNotification: true, audience: emptyAudience() };

export default function CreateSchoolPostPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const listSearch = location.state?.listSearch ?? '';
  const backTo = `${FEED_PATH}${listSearch}`;

  const options = useAudienceOptions();
  const [form, setForm] = useState(INITIAL);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState(null); // { field, text, bad }
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const sending = useRef(false); // a second click before React re-renders must not send twice

  // Stays true while saving: leave() then removes the guard's extra history entry itself before navigating.
  const dirty =
    normalizeTitle(form.title) !== '' || normalizeContent(form.content) !== '' || !isAudienceEmpty(form.audience) ||
    form.postType !== INITIAL.postType || form.sendNotification !== DEFAULT_SEND_NOTIFICATION[form.postType];
  const { asking, setAsking, stay, leave } = useLeaveGuard(dirty);

  const errors = validatePost(form);
  const shown = (field) =>
    (serverError?.field === field ? serverError.text : null) ?? ((touched[field] || submitted) && errors[field]) ?? null;
  const labels = audienceLabels(form.audience, options);
  const announcement = form.postType === 'ANNOUNCEMENT';

  function change(changes, field) {
    setForm((f) => ({ ...f, ...changes }));
    if (field) setTouched((t) => ({ ...t, [field]: true }));
    setServerError(null);
  }

  // Changing the type puts back the type's notification default (§8); the chosen audience is kept (NEWS may have one).
  function changeType(postType) {
    if (postType === form.postType) return;
    change({ postType, sendNotification: DEFAULT_SEND_NOTIFICATION[postType] });
  }

  function submit(e) {
    e.preventDefault();
    if (saving || options.loading) return;
    setSubmitted(true);
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (first) {
      document.getElementById(FIELD_FOCUS[first])?.focus();
      return;
    }
    setConfirming(true);
  }

  async function post() {
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    try {
      const data = await createSchoolPost({
        title: normalizeTitle(form.title),
        content: normalizeContent(form.content),
        postType: form.postType,
        sendNotification: form.sendNotification,
        gradeLevelIds: form.audience.gradeLevelIds,
        classIds: form.audience.classIds,
      });
      toast(announcement ? 'Đã đăng thông báo.' : 'Đã đăng tin tức.');
      handOverPost(data);
      leave(() => navigate(`${FEED_PATH}/${data.post.schoolPostId}`, { replace: true, state: { listSearch } }));
    } catch (err) {
      sending.current = false;
      setSaving(false);
      setConfirming(false);
      const error = saveErrorOf(err, SAVE_ERROR);
      setServerError(error);
      if (error.bad) options.reload();
      if (error.field) document.getElementById(FIELD_FOCUS[error.field])?.focus();
    }
  }

  function cancel(e) {
    e?.preventDefault();
    if (dirty) setAsking({ cancel: true });
    else leave(() => navigate(backTo));
  }

  function confirmLeave() {
    const target = asking;
    setAsking(null);
    if (target?.to) leave(() => navigate(target.to));
    else if (target?.back) leave(null, 1);
    else leave(() => navigate(backTo));
  }

  const titleError = shown('title');
  const contentError = shown('content');
  const audienceError = shown('audience');
  const formError = serverError && !serverError.field ? serverError.text : '';

  return (
    <div className="school-post-form">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Trường</span>/<Link to={backTo}>Bảng tin trường</Link>/
        <span className="current">Soạn bài</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Soạn bài đăng</h1>
          <p>Đăng thông báo hoặc tin tức chính thức của nhà trường lên bảng tin.</p>
        </div>
      </div>

      <div className="spf-layout">
        <form className="card card-outline spf-sheet" onSubmit={submit} noValidate>
          <section className="spf-section" aria-labelledby="spf-type-label">
            <span id="spf-type-label" className="spf-label">
              Loại bài
            </span>
            <PostTypeSwitch value={form.postType} onChange={changeType} disabled={saving} />
            <p id="spf-type-help" className="spf-type-help">
              {POST_TYPE_INFO[form.postType].text}
            </p>
          </section>

          <section className="spf-section">
            <div className={`field${titleError ? ' invalid' : ''}`}>
              <label className="field-label spf-label" htmlFor="spf-title">
                <span>
                  Tiêu đề <span className="spf-required">*</span>
                </span>
                <TitleCounter value={form.title} id="spf-title-count" />
              </label>
              <input
                id="spf-title"
                className="input"
                value={form.title}
                onChange={(e) => change({ title: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, title: true }))}
                placeholder={announcement ? 'Ví dụ: Lịch nghỉ lễ Quốc khánh 2/9' : 'Ví dụ: Đội tuyển học sinh giỏi đạt giải'}
                autoComplete="off"
                disabled={saving}
                aria-invalid={Boolean(titleError)}
                aria-describedby={`spf-title-count${titleError ? ' spf-title-error' : ''}`}
              />
              {titleError && (
                <span id="spf-title-error" className="field-error" role="alert">
                  {titleError}
                </span>
              )}
            </div>

            <div className={`field${contentError ? ' invalid' : ''}`}>
              <label className="field-label spf-label" htmlFor="spf-content">
                <span>
                  Nội dung <span className="spf-required">*</span>
                </span>
              </label>
              <textarea
                id="spf-content"
                className="input spf-content"
                value={form.content}
                onChange={(e) => change({ content: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, content: true }))}
                placeholder="Nhập nội dung bài đăng. Xuống dòng được giữ nguyên khi hiển thị."
                rows={10}
                disabled={saving}
                aria-invalid={Boolean(contentError)}
                aria-describedby={contentError ? 'spf-content-error' : undefined}
              />
              {contentError && (
                <span id="spf-content-error" className="field-error" role="alert">
                  {contentError}
                </span>
              )}
            </div>

            {/* TODO FE-08 attachments (business-rules §15: storage provider not decided yet). */}
            <div className="field spf-attach">
              <span className="field-label spf-label">Tệp đính kèm</span>
              <button type="button" className="spf-attach-box" disabled>
                <Icon name="attach_file" size="sm" />
                <span>Chọn tệp</span>
              </button>
              <span className="field-help">Chưa đính kèm được tệp: nhà trường đang chọn nơi lưu trữ tệp.</span>
            </div>
          </section>

          <section className="spf-section">
            <AudiencePicker
              postType={form.postType}
              options={options}
              value={form.audience}
              onChange={(audience) => change({ audience }, 'audience')}
              disabled={saving}
              error={audienceError}
              bad={serverError?.bad}
            />
          </section>

          <section className="spf-section">
            <label className="spf-switch">
              <input
                type="checkbox"
                checked={form.sendNotification}
                onChange={(e) => change({ sendNotification: e.target.checked })}
                disabled={saving}
                aria-describedby="spf-notify-help"
              />
              <span className="spf-switch-text">
                <span className="spf-switch-title">Gửi thông báo tới người nhận</span>
                <span id="spf-notify-help" className="caption muted">
                  Người nhận sẽ thấy thông báo trong chuông.
                  {announcement ? ' Mặc định bật với thông báo.' : ' Mặc định tắt với tin tức.'}
                </span>
              </span>
            </label>
          </section>

          {formError && (
            <p className="form-error spf-form-error" role="alert">
              <Icon name="error" size="sm" />
              {formError}
            </p>
          )}

          <div className="spf-footer">
            <span className="caption muted spf-footer-note">
              <Icon name="info" size="sm" />
              Bài đăng hiển thị ngay với: {labels.join(', ')}.
            </span>
            <div className="spf-footer-buttons">
              <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>
                Huỷ
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || options.loading}>
                <Icon name={saving ? 'progress_activity' : 'send'} size="sm" className={saving ? 'sf-spin' : undefined} />
                {saving ? 'Đang đăng…' : 'Đăng bài'}
              </button>
            </div>
          </div>
        </form>

        <PostPreview
          postType={form.postType}
          title={form.title}
          content={form.content}
          labels={labels}
          authorName={user?.fullName}
        />
      </div>

      <ConfirmPostDialog
        open={confirming}
        title={form.title}
        postType={form.postType}
        labels={labels}
        sendNotification={form.sendNotification}
        busy={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={post}
      />
      <LeaveDialog open={Boolean(asking)} onStay={stay} onLeave={confirmLeave} />
    </div>
  );
}
