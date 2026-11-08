import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getSchoolPost, updateSchoolPost } from '../../api/schoolPosts.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { LeaveDialog, useLeaveGuard } from './leaveGuard.jsx';
import { feedErrorText, formatDateTime, handOverPost } from './schoolFeedShared.jsx';
import {
  audienceLabels,
  AudiencePicker,
  normalizeContent,
  normalizeTitle,
  POST_TYPE_INFO,
  PostPreview,
  PostTypeSwitch,
  sameAudience,
  saveErrorOf,
  TitleCounter,
  useAudienceOptions,
  validatePost,
} from './schoolPostForm.jsx';

// SCR-06 Update School Post (FE-08, owner Anh): UC-61, School Manager only (permissions.md "School post – Update";
// the route is wrapped in ProtectedRoute and the server checks the active role).
// Design: Stitch "SCR-37 Update School Post". Only title, content and the audience can change (lead 07/11/2026);
// postType and sendNotification are shown read only (the server refuses them with MSG_FIELD_NOT_EDITABLE). Only the
// fields that really changed are sent. An audience change sends no new notification (server ASSUMPTION, told on
// screen). Attachments: not built (business-rules §15).

const FEED_PATH = '/school-feed';
const LOAD_ERROR = 'Không tải được bài viết. Vui lòng thử lại.';
const SAVE_ERROR = 'Không lưu được bài viết. Vui lòng thử lại.';
const STALE_CLASSES = 'Hãy bỏ các lớp của năm học khác trước khi lưu đối tượng nhận mới.';
const FIELD_ORDER = ['title', 'content', 'audience'];
const FIELD_FOCUS = { title: 'spf-title', content: 'spf-content', audience: 'spf-audience' };

const audienceOf = (post) => ({
  gradeLevelIds: post.gradeTargets.map((g) => g.gradeLevelId),
  classIds: post.classTargets.map((c) => c.classId),
});
const formOf = (post) => ({ title: post.title, content: post.content, audience: audienceOf(post) });

// The whitelist of UC-61: title, content, gradeLevelIds + classIds (one audience, sent together) – only when changed.
function changedFields(form, post) {
  const changes = {};
  const title = normalizeTitle(form.title);
  if (title !== post.title) changes.title = title;
  const content = normalizeContent(form.content);
  if (content !== post.content) changes.content = content;
  if (!sameAudience(form.audience, audienceOf(post))) {
    changes.gradeLevelIds = form.audience.gradeLevelIds;
    changes.classIds = form.audience.classIds;
  }
  return changes;
}

function NotFound({ backTo }) {
  return (
    <div className="school-post-form">
      <section className="card card-outline spf-missing">
        <Icon name="article" />
        <h1 className="title-md">Không tìm thấy bài viết</h1>
        <p className="muted">Bài viết có thể đã bị gỡ hoặc đường dẫn không còn đúng.</p>
        <Link to={backTo} className="btn btn-primary" data-leave-guard="off">
          <Icon name="arrow_back" size="sm" />
          Về bảng tin trường
        </Link>
      </section>
    </div>
  );
}

function LockedNote({ children }) {
  return (
    <p className="caption spf-locked-note">
      <Icon name="lock" size="sm" />
      <span>{children}</span>
    </p>
  );
}

export default function UpdateSchoolPostPage() {
  const { schoolPostId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const listSearch = location.state?.listSearch ?? '';
  // fromDetail: SCR-05 is right behind this entry in the history, so leaving goes back to it instead of stacking
  // a second copy (as FE-02 Update Student).
  const fromDetail = Boolean(location.state?.fromDetail);
  const backTo = `${FEED_PATH}${listSearch}`;
  const detailPath = `${FEED_PATH}/${schoolPostId}`;
  const validId = /^[1-9]\d*$/.test(schoolPostId ?? '');

  const options = useAudienceOptions();
  const [post, setPost] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(validId);
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(!validId);
  const [attempt, setAttempt] = useState(0);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!validId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    getSchoolPost(schoolPostId, { signal: controller.signal })
      .then((data) => {
        setPost(data.post);
        setForm(formOf(data.post));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err.status === 404 || err.code === 'MSG_SCHOOL_POST_NOT_FOUND') setNotFound(true);
        else setLoadError(feedErrorText(err, LOAD_ERROR));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [schoolPostId, validId, attempt]);

  const changes = post && form ? changedFields(form, post) : {};
  const changedKeys = Object.keys(changes).filter((k) => k !== 'classIds');
  const dirty = changedKeys.length > 0;
  const { asking, setAsking, stay, leave } = useLeaveGuard(dirty && !notFound);

  const backToDetail = useCallback(
    (data) => {
      if (data) handOverPost(data);
      if (fromDetail) leave(null, 1);
      else leave(() => navigate(detailPath, { replace: true, state: { listSearch } }));
    },
    [leave, navigate, detailPath, listSearch, fromDetail],
  );

  if (notFound) return <NotFound backTo={backTo} />;

  if (loadError) {
    return (
      <div className="school-post-form">
        <div className="spf-load-error">
          <p className="form-error" role="alert">
            {loadError}
          </p>
          <div className="actions-row">
            <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
              <Icon name="refresh" size="sm" />
              Thử lại
            </button>
            <Link to={backTo} className="btn btn-tertiary">
              Về bảng tin trường
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !post || !form) {
    return (
      <div className="school-post-form" aria-busy="true">
        <div className="page-header">
          <div>
            <h1 className="headline-xl">Sửa bài đăng</h1>
            <p>Đang tải bài viết…</p>
          </div>
        </div>
        <div className="card card-outline spf-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  const announcement = post.postType === 'ANNOUNCEMENT';
  const offered = new Set(options.classes.map((c) => c.classId));
  // Targets outside the current school year (known only once the options are loaded).
  const staleClasses = options.loading || options.error ? [] : post.classTargets.filter((c) => !offered.has(c.classId));
  const audienceChanged = 'gradeLevelIds' in changes;

  const errors = validatePost({ ...form, postType: post.postType });
  if (!errors.audience && audienceChanged && staleClasses.some((c) => form.audience.classIds.includes(c.classId))) {
    errors.audience = STALE_CLASSES;
  }
  const shown = (field) =>
    (serverError?.field === field ? serverError.text : null) ?? ((touched[field] || submitted) && errors[field]) ?? null;
  const labels = audienceLabels(form.audience, options, post.classTargets);

  function change(next, field) {
    setForm((f) => ({ ...f, ...next }));
    if (field) setTouched((t) => ({ ...t, [field]: true }));
    setServerError(null);
  }

  async function save(e) {
    e.preventDefault();
    if (saving || !dirty) return;
    setSubmitted(true);
    const first = FIELD_ORDER.find((f) => errors[f]);
    if (first) {
      document.getElementById(FIELD_FOCUS[first])?.focus();
      return;
    }
    setSaving(true);
    try {
      const data = await updateSchoolPost(post.schoolPostId, changes);
      toast('Đã lưu thay đổi của bài viết.');
      backToDetail(data);
    } catch (err) {
      setSaving(false);
      const error = saveErrorOf(err, SAVE_ERROR);
      if (error.notFound) {
        setNotFound(true);
        return;
      }
      setServerError(error);
      if (error.bad) options.reload();
      if (error.field) document.getElementById(FIELD_FOCUS[error.field])?.focus();
    }
  }

  function cancel(e) {
    e?.preventDefault();
    if (dirty) setAsking({ cancel: true });
    else backToDetail(null);
  }

  function confirmLeave() {
    const target = asking;
    setAsking(null);
    if (target?.to) leave(() => navigate(target.to));
    else if (target?.back) leave(null, 1);
    else backToDetail(null);
  }

  const titleError = shown('title');
  const contentError = shown('content');
  const audienceError = shown('audience');
  const formError = serverError && !serverError.field ? serverError.text : '';
  const changedCount = changedKeys.length;

  return (
    <div className="school-post-form">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Trường</span>/<Link to={backTo}>Bảng tin trường</Link>/
        <Link to={detailPath} data-leave-guard="off" onClick={cancel}>
          Chi tiết
        </Link>
        /<span className="current">Sửa bài</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Sửa bài đăng</h1>
          <p>
            Đăng lúc {formatDateTime(post.createdAt)} bởi {post.authorName}
          </p>
        </div>
      </div>

      <div className="spf-layout">
        <form className="card card-outline spf-sheet" onSubmit={save} noValidate>
          <section className="spf-section is-readonly" aria-labelledby="spf-type-label">
            <span id="spf-type-label" className="spf-label">
              Loại bài
            </span>
            <PostTypeSwitch value={post.postType} readOnly />
            <p id="spf-type-help" className="spf-type-help">
              {POST_TYPE_INFO[post.postType].text}
            </p>
            <LockedNote>
              Không đổi được loại bài sau khi đăng: lượt thích, bình luận, ghim và thông báo đã gửi đều gắn với loại bài.
              Nếu cần loại khác, hãy xoá bài này và đăng bài mới.
            </LockedNote>
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
            {/* TODO FE-08 attachments (business-rules §15): adding / removing files comes with the storage provider. */}
          </section>

          <section className="spf-section">
            <AudiencePicker
              postType={post.postType}
              options={options}
              value={form.audience}
              onChange={(audience) => change({ audience }, 'audience')}
              disabled={saving}
              error={audienceError}
              bad={serverError?.bad}
              staleClasses={staleClasses}
              note={
                <div className={`notice ${audienceChanged ? 'amber' : 'ink'} spf-audience-note`}>
                  <Icon name={audienceChanged ? 'notifications_off' : 'info'} size="sm" />
                  <p>
                    Sửa đối tượng nhận không gửi thông báo mới. Người mới thuộc đối tượng nhận sẽ thấy bài trên bảng tin
                    nhưng không nhận thông báo; người không còn thuộc đối tượng nhận sẽ không thấy bài nữa.
                  </p>
                </div>
              }
            />
          </section>

          <section className="spf-section is-readonly">
            <label className="spf-switch is-locked">
              <input type="checkbox" checked={post.sendNotification} disabled readOnly aria-describedby="spf-notify-help" />
              <span className="spf-switch-text">
                <span className="spf-switch-title">
                  {post.sendNotification ? 'Đã gửi thông báo tới người nhận' : 'Không gửi thông báo'}
                </span>
                <span id="spf-notify-help" className="caption muted">
                  Thông báo chỉ được gửi một lần khi đăng bài, nên không thay đổi được ở đây.
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
            <span className="caption muted spf-footer-note" aria-live="polite">
              <Icon name={changedCount ? 'edit_note' : 'check'} size="sm" />
              {changedCount ? `Có ${changedCount} mục đã thay đổi, chưa lưu.` : 'Chưa có thay đổi nào.'}
            </span>
            <div className="spf-footer-buttons">
              <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>
                Huỷ
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>
                <Icon name={saving ? 'progress_activity' : 'save'} size="sm" className={saving ? 'sf-spin' : undefined} />
                {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </form>

        <PostPreview
          postType={post.postType}
          title={form.title}
          content={form.content}
          labels={labels}
          authorName={post.authorName ?? user?.fullName}
        />
      </div>

      <LeaveDialog open={Boolean(asking)} onStay={stay} onLeave={confirmLeave} />
    </div>
  );
}
