import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getParent } from '../../api/parents.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { errorText, GENDER_LABELS, RELATIONSHIP_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import { clearHandedOverParentDetail, peekHandedOverParentDetail } from './parentHandoff.js';
import './ParentDetailPage.css';

// Same labels and texts as Student Detail (SCR-08), so both detail screens read alike.
const ENROLLMENT_LABELS = { STUDYING: 'Đang học', TRANSFERRED: 'Đã chuyển lớp', DROPPED: 'Đã nghỉ học' };
const NOT_BUILT = 'Chức năng đang phát triển';
const GENERIC_ERROR = 'Không tải được thông tin phụ huynh. Vui lòng thử lại.';
const EMPTY_VALUE = 'Chưa cập nhật';
const SA_ONLY = 'Chỉ Quản trị hệ thống thay đổi được.';

// "2026-10-27 05:57:01+07" (Vietnam time from the API) -> "05:57, 27/10/2026"
function formatDateTime(value) {
  if (!value) return '';
  return `${String(value).slice(11, 16)}, ${formatDate(value)}`;
}

// "2026-2027" -> "2026 – 2027"
const yearLabel = (name) => String(name ?? '').replace('-', ' – ');

// Same rule as Student Detail: codes missing from messages.js get a general message instead of the English text.
function loadErrorText(err) {
  const generic = errorText({ code: 'SERVER_ERROR' });
  const text = errorText({ code: err.code, details: err.details });
  if (text === generic && err.code !== 'SERVER_ERROR') {
    console.warn(`[ParentDetail] No Vietnamese message for error code ${err.code}:`, err.message);
    return GENERIC_ERROR;
  }
  return text;
}

function Field({ label, readOnly, wide, children }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'wide' : undefined}>
      <dt>
        <span>{label}</span>
        {readOnly && (
          <span className="parent-detail-readonly" title={SA_ONLY}>
            (Chỉ đọc)
          </span>
        )}
      </dt>
      <dd className={`${readOnly ? 'is-readonly' : ''}${empty ? ' empty' : ''}`.trim() || undefined}>
        {empty ? EMPTY_VALUE : children}
      </dd>
    </div>
  );
}

// "…" menu ("Bảo mật & quyền"), as on Student Detail. Every action belongs to FE-13 (business-rules §2, Linh), so the
// items stay disabled here.
function AccountMenu({ parent }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const locked = parent.accountStatus === 'LOCKED';
  return (
    <div className="parent-detail-menu-wrap" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary btn-icon-only"
        aria-label="Bảo mật và quyền"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more_horiz" size="sm" />
      </button>
      {open && (
        <div className="parent-detail-menu" role="menu">
          <p className="label-upper">Bảo mật &amp; quyền</p>
          {/* TODO UC-100 Reset Password (FE-13, Linh) */}
          <button type="button" role="menuitem" disabled title={NOT_BUILT}>
            <Icon name="key" size="sm" />
            Đặt lại mật khẩu
          </button>
          {/* TODO UC-101 Lock / Unlock Account – clear the temporary sign-in lock (FE-13, Linh) */}
          {parent.lockedUntil && (
            <button type="button" role="menuitem" disabled title={NOT_BUILT}>
              <Icon name="lock_open" size="sm" />
              Mở tạm khoá đăng nhập
            </button>
          )}
          <hr />
          {/* TODO UC-101 Lock / Unlock Account (FE-13, Linh) */}
          <button type="button" role="menuitem" className={locked ? undefined : 'danger'} disabled title={NOT_BUILT}>
            <Icon name={locked ? 'lock_open' : 'lock_person'} size="sm" />
            {locked ? 'Mở khoá tài khoản' : 'Khoá tài khoản'}
          </button>
        </div>
      )}
    </div>
  );
}

// Manual lock (users.status = LOCKED) and the automatic temporary sign-in lock (locked_until) are different things
// (business-rules §3) and get different rows – same component as Student Detail.
function AccountState({ parent }) {
  const rows = [];
  if (parent.accountStatus === 'LOCKED') {
    rows.push({
      key: 'locked',
      tone: 'red',
      icon: 'lock',
      title: 'Tài khoản đã bị khoá',
      text: 'Phụ huynh không đăng nhập được cho đến khi tài khoản được mở khoá.',
    });
  }
  if (parent.lockedUntil) {
    rows.push({
      key: 'temp',
      tone: 'amber',
      icon: 'timer',
      title: 'Đang tạm khoá đăng nhập',
      text: `Do nhập sai mật khẩu nhiều lần. Tự động mở lúc ${formatDateTime(parent.lockedUntil)}.`,
    });
  }
  if (parent.mustChangePassword) {
    rows.push({
      key: 'password',
      tone: 'neutral',
      icon: 'password',
      title: 'Chưa đổi mật khẩu lần đầu',
      text: 'Phụ huynh sẽ phải đổi mật khẩu tạm thời ở lần đăng nhập tiếp theo.',
    });
  }
  if (!rows.length) {
    rows.push({
      key: 'ok',
      tone: 'green',
      icon: 'verified_user',
      title: 'Bình thường',
      text: 'Tài khoản đang hoạt động, không bị khoá.',
    });
  }
  return (
    <ul className="parent-detail-security">
      {rows.map((r) => (
        <li key={r.key} className={r.tone}>
          <Icon name={r.icon} />
          <div>
            <p className="strong">{r.title}</p>
            <p className="caption muted">{r.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AccountPills({ parent }) {
  const locked = parent.accountStatus === 'LOCKED';
  return (
    <>
      <span className={`pill${locked ? '' : ' green'}`}>{locked ? 'Đã khoá' : 'Hoạt động'}</span>
      {parent.lockedUntil && <span className="pill amber">Tạm khoá đăng nhập</span>}
      {parent.mustChangePassword && <span className="chip">Chưa đổi mật khẩu lần đầu</span>}
    </>
  );
}

// One linked child. The card opens Student Detail (SCR-08); the name is the link for keyboard and screen readers,
// the rest of the card is a mouse shortcut, as the list rows are.
function ChildCard({ child }) {
  const navigate = useNavigate();
  const detailPath = `/students/${child.studentId}`;
  const openDetail = (e) => {
    if (e.target.closest('a, button')) return;
    navigate(detailPath);
  };
  return (
    <article className="parent-detail-child" onClick={openDetail}>
      <header>
        <Avatar src={child.avatarUrl} name={child.fullName} size={40} />
        <div>
          <Link to={detailPath} className="strong">
            {child.fullName}
          </Link>
          <p className="caption muted mono">{child.studentCode}</p>
        </div>
        <span className="chip ink">{RELATIONSHIP_LABELS[child.relationshipType] ?? child.relationshipType}</span>
      </header>
      <dl className="caption">
        <div>
          <dt>Lớp hiện tại:</dt>
          {child.classId ? (
            <dd>
              {child.className} · Khối {child.gradeLevelName}
              {child.enrollmentStatus && child.enrollmentStatus !== 'STUDYING' && (
                <span className="chip">{ENROLLMENT_LABELS[child.enrollmentStatus] ?? child.enrollmentStatus}</span>
              )}
            </dd>
          ) : (
            <dd className="muted">Chưa xếp lớp</dd>
          )}
        </div>
        {child.classId && (
          <div>
            {/* Same label as Student Detail's class history. */}
            <dt>Tổ hợp / Ban:</dt>
            <dd>{child.trackName}</dd>
          </div>
        )}
        {child.classId && (
          <div>
            <dt>Năm học:</dt>
            <dd>{yearLabel(child.schoolYearName)}</dd>
          </div>
        )}
        {child.classId && (
          <div>
            <dt>GVCN:</dt>
            <dd className={child.homeroomTeacherName ? undefined : 'muted'}>
              {child.homeroomTeacherName ?? 'Chưa phân công'}
            </dd>
          </div>
        )}
        <div>
          <dt>Ngày sinh:</dt>
          <dd className={child.dob ? 'mono' : 'muted'}>
            {child.dob ? formatDate(child.dob) : EMPTY_VALUE}
            {child.gender && ` · ${GENDER_LABELS[child.gender] ?? child.gender}`}
          </dd>
        </div>
        <div>
          <dt>Liên kết từ:</dt>
          <dd className="mono">{formatDate(child.linkedAt)}</dd>
        </div>
      </dl>
      {/* Link / unlink is UC-13 (FE-02), which works from the student's side: this opens it for this child. */}
      <Link to={`/students/${child.studentId}/parents/edit`} className="btn btn-tertiary parent-detail-child-manage">
        <Icon name="link" size="sm" />
        Quản lý liên kết của học sinh
      </Link>
    </article>
  );
}

// Read only. Link / unlink is UC-13 (FE-02), from the student's side.
function ChildrenCard({ items }) {
  return (
    <section className="card card-outline parent-detail-children">
      <h2 className="card-title title-sm">
        <Icon name="family_restroom" />
        Con đang liên kết
        <span className="aside caption muted mono">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        // business-rules §3: accounts are created first and linked afterwards, so this is a normal state, not an error.
        <div className="notice parent-detail-children-empty">
          <Icon name="info" />
          <div>
            <p className="notice-title">Phụ huynh chưa được liên kết với học sinh nào.</p>
            <p className="caption">
              Tài khoản phụ huynh được tạo trước, sau đó nhà trường liên kết với học sinh từ hồ sơ của từng học sinh.
            </p>
          </div>
        </div>
      ) : (
        <div className="parent-detail-child-list">
          {items.map((c) => (
            <ChildCard key={c.studentId} child={c} />
          ))}
        </div>
      )}
      <div className="parent-detail-link-more">
        {/* TODO UC-13 from the parent's side: Update Student Relationship (SCR-13) starts from a student
            (/students/:studentId/parents/edit) and has no "pick a student" step, so a new child is linked from that
            student's record ("Xem phụ huynh" → "Cập nhật liên kết"). Enable this once SCR-13 can take a parent. */}
        <button type="button" className="btn btn-secondary" disabled title={NOT_BUILT}>
          <Icon name="person_add" size="sm" />
          Liên kết con
        </button>
        <p className="caption muted">Để liên kết thêm con, mở hồ sơ học sinh và chọn Xem phụ huynh.</p>
      </div>
    </section>
  );
}

function Breadcrumb({ backTo, current }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Phụ huynh</Link>
      {current && (
        <>
          /<span className="current mono">{current}</span>
        </>
      )}
    </nav>
  );
}

function Skeleton({ backTo }) {
  return (
    <div className="parent-detail" aria-busy="true">
      <Breadcrumb backTo={backTo} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chi tiết phụ huynh</h1>
          <p>Đang tải thông tin phụ huynh…</p>
        </div>
      </div>
      <div className="card card-outline parent-detail-identity parent-detail-skeleton" aria-hidden="true">
        <span className="block avatar-block" />
        <span className="block" />
      </div>
      <div className="parent-detail-grid" aria-hidden="true">
        <div className="card card-outline parent-detail-skeleton tall">
          <span className="block" />
          <span className="block" />
          <span className="block" />
        </div>
        <div className="card card-outline parent-detail-skeleton tall">
          <span className="block" />
          <span className="block" />
        </div>
      </div>
    </div>
  );
}

function NotFound({ backTo }) {
  return (
    <div className="parent-detail">
      <Breadcrumb backTo={backTo} />
      <section className="card card-outline parent-detail-missing">
        <Icon name="person_search" />
        <h1 className="title-md">Không tìm thấy phụ huynh</h1>
        <p className="muted">Phụ huynh này không tồn tại hoặc đường dẫn không đúng.</p>
        <Link to={backTo} className="btn btn-primary">
          <Icon name="arrow_back" size="sm" />
          Quay lại danh sách
        </Link>
      </section>
    </div>
  );
}

// SCR-10 Parent Detail (UC-105 View Parent Detail), School Manager only. Read only: updating is UC-106 (SCR-16,
// UpdateParentPage), link / unlink UC-13 (FE-02), reset password and lock / unlock FE-13 (UC-100 / UC-101).
// No Stitch design exists for this screen; it follows Student Detail (SCR-08).
export default function ParentDetailPage() {
  const { parentId } = useParams();
  const location = useLocation();
  // The list passes its query string, so going back keeps the filters and page (the list keeps them in the URL).
  const backTo = `/parents${location.state?.listSearch ?? ''}`;
  // Same rule as Student Detail: an id that is not a positive integer is "not found" without calling the API.
  const validId = /^[1-9]\d*$/.test(parentId ?? '');

  // Coming back from UC-106: the edit page hands over the saved data, shown without a new request.
  const [handedOver] = useState(() => peekHandedOverParentDetail(Number(parentId)));
  const initialData = useRef(handedOver);
  const [data, setData] = useState(handedOver);
  const [loading, setLoading] = useState(validId && !handedOver);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => clearHandedOverParentDetail(), []);

  useEffect(() => {
    if (!validId) return undefined;
    if (attempt === 0 && initialData.current?.parent.parentId === Number(parentId)) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getParent(parentId, { signal: controller.signal })
      .then((result) => setData(result))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [parentId, validId, attempt]);

  if (!validId) return <NotFound backTo={backTo} />;
  if (error && (error.status === 404 || error.code === 'MSG_PARENT_NOT_FOUND' || error.code === 'MSG_INVALID_PARAM')) {
    return <NotFound backTo={backTo} />;
  }
  if (error) {
    return (
      <div className="parent-detail">
        <Breadcrumb backTo={backTo} />
        <div className="form-error" role="alert">
          <Icon name="error" size="sm" />
          <p>{loadErrorText(error)}</p>
        </div>
        <div className="actions-row parent-detail-retry">
          <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="refresh" size="sm" />
            Thử lại
          </button>
          <Link to={backTo} className="btn btn-tertiary">
            Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }
  if (loading || !data) return <Skeleton backTo={backTo} />;

  const { parent, children } = data;

  return (
    <div className="parent-detail">
      <Breadcrumb backTo={backTo} current={parent.phone || parent.username} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chi tiết phụ huynh</h1>
          <p>Hồ sơ &amp; tài khoản phụ huynh {parent.fullName}</p>
        </div>
        <div className="actions-row">
          {/* UC-106 Update Parent (SCR-16). The loaded data goes along so the form needs no second request, and
              fromDetail tells the form that this page is the history entry behind it. */}
          <Link
            to={`/parents/${parent.parentId}/edit`}
            state={{ detail: data, fromDetail: true, listSearch: location.state?.listSearch }}
            className="btn btn-secondary"
          >
            <Icon name="edit" size="sm" />
            Sửa thông tin
          </Link>
          <AccountMenu parent={parent} />
        </div>
      </div>

      <section className="card card-outline parent-detail-identity" aria-label="Thông tin nhận diện">
        <Avatar src={parent.avatarUrl} name={parent.fullName} size={64} />
        <div>
          <div className="parent-detail-identity-name">
            <h2 className="title-md">{parent.fullName}</h2>
            <AccountPills parent={parent} />
          </div>
          <ul className="parent-detail-meta caption">
            {/* The phone identifies a parent with several children (business-rules §3). */}
            <li className="phone">
              <Icon name="call" size="sm" />
              <span className="mono">{parent.phone || EMPTY_VALUE}</span>
            </li>
            <li>
              <Icon name="alternate_email" size="sm" />
              <span className="mono">{parent.username}</span>
            </li>
            <li>
              <Icon name="family_restroom" size="sm" />
              <span>{children.length ? `${children.length} con đang liên kết` : 'Chưa liên kết con'}</span>
            </li>
          </ul>
        </div>
      </section>

      <div className="parent-detail-grid">
        <section className="card card-outline parent-detail-info">
          <h2 className="card-title title-sm">
            <Icon name="badge" />
            Thông tin cá nhân
          </h2>
          <dl className="dl parent-detail-fields">
            <Field label="Họ và tên" wide>
              <span className="strong">{parent.fullName}</span>
            </Field>
            {/* Only System Admin changes the username, email and phone (business-rules §3, UC-99). */}
            <Field label="Tên đăng nhập" readOnly>
              {parent.username && <span className="mono">{parent.username}</span>}
            </Field>
            <Field label="Số điện thoại" readOnly>
              {parent.phone && <span className="mono">{parent.phone}</span>}
            </Field>
            <Field label="Email" readOnly>
              {parent.email}
            </Field>
            <Field label="Nghề nghiệp">{parent.occupation}</Field>
            <Field label="Ngày tạo tài khoản">
              {parent.createdAt && <span className="mono">{formatDate(parent.createdAt)}</span>}
            </Field>
            {/* address is users.address (business-rules §3); School Manager edits it in UC-106. */}
            <Field label="Địa chỉ" wide>
              {parent.address}
            </Field>
            <div className="wide parent-detail-security-wrap">
              <dt>Trạng thái bảo mật tài khoản</dt>
              <dd>
                <AccountState parent={parent} />
              </dd>
            </div>
          </dl>
          <p className="caption muted parent-detail-sa-note">
            <Icon name="lock" size="sm" />
            Tên đăng nhập, số điện thoại và email chỉ Quản trị hệ thống thay đổi được.
          </p>
        </section>

        <div className="parent-detail-side">
          <ChildrenCard items={children} />
        </div>
      </div>
    </div>
  );
}
