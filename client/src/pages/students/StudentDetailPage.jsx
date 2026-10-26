import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getStudent } from '../../api/students.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, GENDER_LABELS, RELATIONSHIP_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import './StudentDetailPage.css';

// Same labels as the Student List (SCR-07).
const ENROLLMENT_LABELS = { STUDYING: 'Đang học', TRANSFERRED: 'Đã chuyển lớp', DROPPED: 'Đã nghỉ học' };
const MAX_PARENTS = 2; // business-rules §3
const NOT_BUILT = 'Chức năng đang phát triển';
const GENERIC_ERROR = 'Không tải được thông tin học sinh. Vui lòng thử lại.';
const EMPTY_VALUE = 'Chưa cập nhật';

// "2026-10-27 05:57:01+07" (Vietnam time from the API) -> "05:57, 27/10/2026"
function formatDateTime(value) {
  if (!value) return '';
  return `${String(value).slice(11, 16)}, ${formatDate(value)}`;
}

// Age in whole years from a "YYYY-MM-DD" date of birth, on the viewer's calendar date.
function ageOf(dob) {
  const [y, m, d] = String(dob).split('-').map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const month = now.getMonth() + 1;
  return now.getFullYear() - y - (month < m || (month === m && now.getDate() < d) ? 1 : 0);
}

// "2026-2027" -> "2026 – 2027"
const yearLabel = (name) => String(name ?? '').replace('-', ' – ');

// Same rule as the Student List: codes missing from messages.js get a general message instead of the English
// server text. MSG_INVALID_PARAM and MSG_STUDENT_NOT_FOUND are waiting for approval (handled below as "not found").
function loadErrorText(err) {
  const generic = errorText({ code: 'SERVER_ERROR' });
  const text = errorText({ code: err.code, details: err.details });
  if (text === generic && err.code !== 'SERVER_ERROR') {
    console.warn(`[StudentDetail] No Vietnamese message for error code ${err.code}:`, err.message);
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
        {readOnly && <span className="student-detail-readonly">(Chỉ đọc)</span>}
      </dt>
      <dd className={`${readOnly ? 'is-readonly' : ''}${empty ? ' empty' : ''}`.trim() || undefined}>
        {empty ? EMPTY_VALUE : children}
      </dd>
    </div>
  );
}

function CopyButton({ value, label }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast('Đã sao chép mã học sinh.');
    } catch {
      toast('Không sao chép được. Vui lòng chọn và sao chép thủ công.', { type: 'error' });
    }
  }
  return (
    <button type="button" className="btn btn-icon" onClick={copy} aria-label={label} title="Sao chép">
      <Icon name="content_copy" size="sm" />
    </button>
  );
}

// "…" menu of the design ("Bảo mật & quyền"). Every action belongs to FE-13 (business-rules §2) and has no API yet.
function AccountMenu({ student }) {
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

  const locked = student.accountStatus === 'LOCKED';
  return (
    <div className="student-detail-menu-wrap" ref={ref}>
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
        <div className="student-detail-menu" role="menu">
          <p className="label-upper">Bảo mật &amp; quyền</p>
          {/* TODO UC-100 Reset Password (FE-13, Linh) */}
          <button type="button" role="menuitem" disabled title={NOT_BUILT}>
            <Icon name="key" size="sm" />
            Đặt lại mật khẩu
          </button>
          {/* TODO UC-101 Lock / Unlock Account – clear the temporary sign-in lock (FE-13, Linh) */}
          {student.lockedUntil && (
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
// (business-rules §3) and get different rows.
function AccountState({ student }) {
  const rows = [];
  if (student.accountStatus === 'LOCKED') {
    rows.push({
      key: 'locked',
      tone: 'red',
      icon: 'lock',
      title: 'Tài khoản đã bị khoá',
      text: 'Học sinh không đăng nhập được cho đến khi tài khoản được mở khoá.',
    });
  }
  if (student.lockedUntil) {
    rows.push({
      key: 'temp',
      tone: 'amber',
      icon: 'timer',
      title: 'Đang tạm khoá đăng nhập',
      text: `Do nhập sai mật khẩu nhiều lần. Tự động mở lúc ${formatDateTime(student.lockedUntil)}.`,
    });
  }
  if (student.mustChangePassword) {
    rows.push({
      key: 'password',
      tone: 'neutral',
      icon: 'password',
      title: 'Chưa đổi mật khẩu lần đầu',
      text: 'Học sinh sẽ phải đổi mật khẩu tạm thời ở lần đăng nhập tiếp theo.',
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
    <ul className="student-detail-security">
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

function AccountPills({ student }) {
  const locked = student.accountStatus === 'LOCKED';
  return (
    <>
      <span className={`pill${locked ? '' : ' green'}`}>{locked ? 'Đã khoá' : 'Hoạt động'}</span>
      {student.lockedUntil && <span className="pill amber">Tạm khoá đăng nhập</span>}
      {student.mustChangePassword && <span className="chip">Chưa đổi mật khẩu lần đầu</span>}
    </>
  );
}

// Class history, newest first. A transfer leaves a TRANSFERRED row next to the new one (business-rules §4), so one
// school year can have several entries; they are not merged.
function ClassTimeline({ current, history }) {
  return (
    <section className="card card-outline student-detail-timeline">
      <h2 className="card-title title-sm">
        <Icon name="history_edu" />
        Quá trình học
        <span className="aside caption">THPT</span>
      </h2>
      {!current && (
        <div className="notice">
          <Icon name="info" />
          <p>Học sinh chưa được xếp lớp trong năm học này.</p>
        </div>
      )}
      {history.length > 0 && (
        <ol>
          {history.map((e) => {
            const isCurrent = current?.enrollmentId === e.enrollmentId;
            return (
              <li key={e.enrollmentId} className={isCurrent ? 'current' : undefined}>
                <div className="student-detail-timeline-head">
                  <span className="strong">{yearLabel(e.schoolYearName)}</span>
                  <span className={`pill${e.status === 'STUDYING' ? ' green' : ''}`}>
                    {ENROLLMENT_LABELS[e.status] ?? e.status}
                  </span>
                </div>
                <dl className="caption">
                  <div>
                    <dt>Lớp:</dt>
                    <dd>
                      {e.className} · Khối {e.gradeLevelName}
                    </dd>
                  </div>
                  {isCurrent && (
                    <div>
                      <dt>GVCN:</dt>
                      <dd className={current.homeroomTeacherName ? undefined : 'muted'}>
                        {current.homeroomTeacherName ?? 'Chưa phân công'}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Tổ hợp / Ban:</dt>
                    <dd>{e.trackName}</dd>
                  </div>
                  {isCurrent && current.nickname && (
                    <div>
                      <dt>Biệt danh trong lớp:</dt>
                      <dd>{current.nickname}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Thời gian:</dt>
                    {/* "– nay" only for the current enrollment: after a promotion the old row has no left_at
                        (business-rules §4: promotion = new enrollment), so it is shown as a start date only. */}
                    <dd className="mono">
                      {e.leftAt && `${formatDate(e.enrolledAt)} – ${formatDate(e.leftAt)}`}
                      {!e.leftAt && (isCurrent ? `${formatDate(e.enrolledAt)} – nay` : `Từ ${formatDate(e.enrolledAt)}`)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// Read only. Link / unlink is UC-13 and the parent detail screen is UC-12.
function ParentsCard({ parents }) {
  return (
    <section className="card card-outline student-detail-parents">
      <h2 className="card-title title-sm">
        <Icon name="contact_phone" />
        Phụ huynh liên kết
        <span className="aside caption muted mono">
          {parents.length}/{MAX_PARENTS}
        </span>
      </h2>
      {parents.length === 0 ? (
        <div className="student-detail-parents-empty">
          <p className="muted">Chưa liên kết phụ huynh.</p>
          {/* TODO UC-13 Update Student Relationship (SCR-13) */}
          <button type="button" className="btn btn-secondary" disabled title={NOT_BUILT}>
            <Icon name="link" size="sm" />
            Liên kết phụ huynh
          </button>
        </div>
      ) : (
        <div className="student-detail-parent-list">
          {parents.map((p) => (
            <article key={p.parentId} className="student-detail-parent">
              <header>
                <Avatar src={p.avatarUrl} name={p.fullName} size={32} />
                <div>
                  <p className="strong">{p.fullName}</p>
                  <p className="caption muted">{RELATIONSHIP_LABELS[p.relationshipType] ?? p.relationshipType}</p>
                </div>
                {p.accountStatus === 'LOCKED' && <span className="pill">Đã khoá</span>}
              </header>
              <ul className="caption">
                <li>
                  <Icon name="call" size="sm" />
                  <span className={p.phone ? 'mono' : 'empty'}>{p.phone || EMPTY_VALUE}</span>
                </li>
                <li>
                  <Icon name="mail" size="sm" />
                  <span className={p.email ? undefined : 'empty'}>{p.email || EMPTY_VALUE}</span>
                </li>
                {p.occupation && (
                  <li>
                    <Icon name="work" size="sm" />
                    <span>{p.occupation}</span>
                  </li>
                )}
                {p.address && (
                  <li>
                    <Icon name="pin_drop" size="sm" />
                    <span>{p.address}</span>
                  </li>
                )}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Breadcrumb({ backTo, current }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
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
    <div className="student-detail" aria-busy="true">
      <Breadcrumb backTo={backTo} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chi tiết học sinh</h1>
          <p>Đang tải thông tin học sinh…</p>
        </div>
      </div>
      <div className="card card-outline student-detail-identity student-detail-skeleton" aria-hidden="true">
        <span className="block avatar-block" />
        <span className="block" />
      </div>
      <div className="student-detail-grid" aria-hidden="true">
        <div className="card card-outline student-detail-skeleton tall">
          <span className="block" />
          <span className="block" />
          <span className="block" />
        </div>
        <div className="card card-outline student-detail-skeleton tall">
          <span className="block" />
          <span className="block" />
        </div>
      </div>
    </div>
  );
}

function NotFound({ backTo }) {
  return (
    <div className="student-detail">
      <Breadcrumb backTo={backTo} />
      <section className="card card-outline student-detail-missing">
        <Icon name="person_search" />
        <h1 className="title-md">Không tìm thấy học sinh</h1>
        <p className="muted">Học sinh này không tồn tại hoặc đường dẫn không đúng.</p>
        <Link to={backTo} className="btn btn-primary">
          <Icon name="arrow_back" size="sm" />
          Quay lại danh sách
        </Link>
      </section>
    </div>
  );
}

// SCR-08 Student Detail (UC-08 View Student Detail), School Manager only. Read only: updating is UC-09 (SCR-09),
// parents UC-12 / UC-13 (SCR-12 / SCR-13), reset password and lock / unlock FE-13 (UC-100 / UC-101).
export default function StudentDetailPage() {
  const { studentId } = useParams();
  const location = useLocation();
  // The list passes its query string, so going back keeps the filters and page (the list keeps them in the URL).
  const backTo = `/students${location.state?.listSearch ?? ''}`;
  // ASSUMPTION: an id that is not a positive integer is shown as "not found" without calling the API.
  const validId = /^[1-9]\d*$/.test(studentId ?? '');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(validId);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!validId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getStudent(studentId, { signal: controller.signal })
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
  }, [studentId, validId, attempt]);

  if (!validId) return <NotFound backTo={backTo} />;
  if (error && (error.status === 404 || error.code === 'MSG_STUDENT_NOT_FOUND' || error.code === 'MSG_INVALID_PARAM')) {
    return <NotFound backTo={backTo} />;
  }
  if (error) {
    return (
      <div className="student-detail">
        <Breadcrumb backTo={backTo} />
        <div className="form-error" role="alert">
          <Icon name="error" size="sm" />
          <p>{loadErrorText(error)}</p>
        </div>
        <div className="actions-row student-detail-retry">
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

  const { student, currentEnrollment: current, enrollmentHistory, parents } = data;
  const age = student.dob ? ageOf(student.dob) : null;

  return (
    <div className="student-detail">
      <Breadcrumb backTo={backTo} current={student.studentCode} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Chi tiết học sinh</h1>
          <p>Hồ sơ học vụ &amp; tài khoản học sinh {student.fullName}</p>
        </div>
        <div className="actions-row">
          {/* TODO UC-09 Update Student (SCR-09) */}
          <button type="button" className="btn btn-secondary" disabled title={NOT_BUILT}>
            <Icon name="edit" size="sm" />
            Sửa thông tin
          </button>
          {/* TODO UC-12 View Student's Parents (SCR-12) */}
          <button type="button" className="btn btn-secondary" disabled title={NOT_BUILT}>
            <Icon name="family_restroom" size="sm" />
            Xem phụ huynh
          </button>
          <AccountMenu student={student} />
        </div>
      </div>

      <section className="card card-outline student-detail-identity" aria-label="Thông tin nhận diện">
        <Avatar src={student.avatarUrl} name={student.fullName} size={64} />
        <div>
          <div className="student-detail-identity-name">
            <h2 className="title-md">{student.fullName}</h2>
            {current ? (
              <span className="chip ink">{current.className}</span>
            ) : (
              <span className="chip">Chưa xếp lớp</span>
            )}
            <AccountPills student={student} />
          </div>
          <ul className="student-detail-meta caption">
            <li>
              <Icon name="fingerprint" size="sm" />
              <span className="mono">{student.studentCode}</span>
            </li>
            <li>
              <Icon name="alternate_email" size="sm" />
              <span className="mono">{student.username}</span>
            </li>
            {current && (
              <li>
                <Icon name="school" size="sm" />
                <span>Năm học {yearLabel(current.schoolYearName)}</span>
              </li>
            )}
          </ul>
        </div>
      </section>

      <div className="student-detail-grid">
        <section className="card card-outline student-detail-info">
          <h2 className="card-title title-sm">
            <Icon name="badge" />
            Thông tin cá nhân &amp; học tịch
          </h2>
          <dl className="dl student-detail-fields">
            <Field label="Mã định danh học sinh">
              <span className="student-detail-code">
                <span className="mono">{student.studentCode}</span>
                <CopyButton value={student.studentCode} label="Sao chép mã học sinh" />
              </span>
            </Field>
            <Field label="Họ và tên học sinh">
              <span className="strong">{student.fullName}</span>
            </Field>
            <Field label="Ngày sinh">
              {student.dob && (
                <span className="mono">
                  {formatDate(student.dob)}
                  {age !== null && ` (${age} tuổi)`}
                </span>
              )}
            </Field>
            <Field label="Giới tính">{student.gender && (GENDER_LABELS[student.gender] ?? student.gender)}</Field>
            {/* Only System Admin changes the username, email and phone (business-rules §3, UC-99). */}
            <Field label="Tên đăng nhập hệ thống" readOnly>
              {student.username && <span className="mono">{student.username}</span>}
            </Field>
            <Field label="Email" readOnly>
              {student.email}
            </Field>
            <Field label="Số điện thoại" readOnly>
              {student.phone && <span className="mono">{student.phone}</span>}
            </Field>
            <Field label="Ngày tạo tài khoản">
              {student.createdAt && <span className="mono">{formatDate(student.createdAt)}</span>}
            </Field>
            <div className="wide student-detail-security-wrap">
              <dt>Trạng thái bảo mật tài khoản</dt>
              <dd>
                <AccountState student={student} />
              </dd>
            </div>
          </dl>
        </section>

        <div className="student-detail-side">
          <ClassTimeline current={current} history={enrollmentHistory} />
          <ParentsCard parents={parents} />
        </div>
      </div>
    </div>
  );
}
