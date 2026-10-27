import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getStudentParents } from '../../api/students.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { errorText, RELATIONSHIP_LABELS } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import './StudentParentsPage.css';

const MAX_PARENTS = 2; // business-rules §3
const NOT_BUILT = 'Chức năng đang phát triển';
const LOAD_ERROR = 'Không tải được thông tin phụ huynh. Vui lòng thử lại.';
const EMPTY_VALUE = 'Chưa cập nhật';

// TODO messages.js: these codes are waiting for the team lead's approval (with the other FE-02 codes). Until then
// the Vietnamese text lives here; errorText() wins as soon as messages.js has the code. Both are normally shown as
// the "not found" page below, the texts are only a fallback.
const LOAD_ERRORS = {
  MSG_STUDENT_NOT_FOUND: 'Không tìm thấy học sinh.',
  MSG_INVALID_PARAM: 'Mã học sinh không hợp lệ.',
};

function loadErrorText(err) {
  const general = errorText({ code: 'SERVER_ERROR' });
  const known = errorText({ code: err.code, details: err.details });
  if (known !== general || err.code === 'SERVER_ERROR') return known;
  if (LOAD_ERRORS[err.code]) return LOAD_ERRORS[err.code];
  console.warn(`[StudentParents] No Vietnamese message for error code ${err.code}:`, err.message);
  return LOAD_ERROR;
}

const relationshipLabel = (type) => RELATIONSHIP_LABELS[type] ?? type;

function Breadcrumb({ backTo, detailPath, detailState, studentCode }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
      {studentCode && (
        <>
          /
          <Link to={detailPath} state={detailState} className="mono">
            {studentCode}
          </Link>
        </>
      )}
      /<span className="current">Phụ huynh liên kết</span>
    </nav>
  );
}

function Skeleton(props) {
  return (
    <div className="student-parents" aria-busy="true">
      <Breadcrumb {...props} />
      <div className="page-header">
        <div>
          <h1 className="headline-xl">Thông tin phụ huynh liên kết</h1>
          <p>Đang tải thông tin phụ huynh…</p>
        </div>
      </div>
      <div className="card card-outline student-parents-summary student-parents-skeleton" aria-hidden="true">
        <span className="block avatar-block" />
        <span className="block" />
      </div>
      <div className="student-parents-list" aria-hidden="true">
        <div className="card card-outline student-parents-skeleton tall">
          <span className="block" />
          <span className="block" />
          <span className="block" />
        </div>
        <div className="card card-outline student-parents-skeleton tall">
          <span className="block" />
          <span className="block" />
        </div>
      </div>
    </div>
  );
}

function NotFound({ backTo }) {
  return (
    <div className="student-parents">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to={backTo}>Học sinh</Link>
      </nav>
      <section className="card card-outline student-parents-missing">
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

// Who the parents are linked to, and how many links are used (business-rules §3: at most 2).
function LinkSummary({ student, parents, canLinkMore }) {
  const count = parents.length;
  let text;
  if (count === 0) text = 'Chưa có phụ huynh nào được liên kết với học sinh này.';
  else if (canLinkMore) text = `Có thể liên kết thêm ${MAX_PARENTS - count} phụ huynh.`;
  else text = 'Đã đủ số phụ huynh tối đa. Cần gỡ một liên kết trước khi liên kết người khác.';
  return (
    <section className="card card-outline student-parents-summary" aria-label="Học sinh và tình trạng liên kết">
      <div className="student-parents-student">
        <Avatar src={student.avatarUrl} name={student.fullName} size={64} />
        <div>
          <div className="student-parents-student-name">
            <h2 className="title-md">{student.fullName}</h2>
            {student.className ? (
              <span className="chip ink">Lớp {student.className}</span>
            ) : (
              <span className="chip">Chưa xếp lớp</span>
            )}
          </div>
          <p className="caption muted">
            Mã học sinh: <span className="mono student-parents-value">{student.studentCode}</span>
          </p>
        </div>
      </div>
      <div className="student-parents-status">
        <div>
          <span className={`pill${count > 0 ? ' green' : ''}`}>
            Đã liên kết {count} / {MAX_PARENTS} phụ huynh
          </span>
          <p className="caption muted">{text}</p>
        </div>
        {!canLinkMore && <span className="stamp">Đủ liên kết</span>}
      </div>
    </section>
  );
}

function ContactRow({ icon, label, children }) {
  return (
    <li>
      <Icon name={icon} size="sm" />
      <div>
        <p className="caption muted">{label}</p>
        {children}
      </div>
    </li>
  );
}

// One linked parent. The relationship (who, since when, other children) comes first; the profile itself belongs
// to FE-14 (business-rules §2) and is only shown read only.
function ParentCard({ parent, onUnlink }) {
  const locked = parent.accountStatus === 'LOCKED';
  const others = parent.otherChildrenCount;
  return (
    <article className="card card-outline student-parents-card">
      <header className="student-parents-card-head">
        <span className="chip ink">
          <Icon name="family_restroom" size="sm" />
          {relationshipLabel(parent.relationshipType)}
        </span>
        {/* Accounts are never deleted, only locked (business-rules §3): a locked parent stays linked. */}
        <span className={`pill${locked ? '' : ' green'}`}>{locked ? 'Đã khoá' : 'Tài khoản hoạt động'}</span>
      </header>

      <div className="student-parents-person">
        <Avatar src={parent.avatarUrl} name={parent.fullName} size={56} />
        <div>
          <h3 className="title-md">{parent.fullName}</h3>
          <p className="caption muted">
            Mối quan hệ: <span className="student-parents-value">{relationshipLabel(parent.relationshipType)}</span>
            {parent.linkedAt && (
              <>
                {' · '}Liên kết từ <span className="mono student-parents-value">{formatDate(parent.linkedAt)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <ul className="student-parents-contact">
        <ContactRow icon="call" label="Số điện thoại liên hệ">
          {parent.phone ? (
            <p className="mono">{parent.phone}</p>
          ) : (
            // Phone is required for parents (business-rules §3): an empty one is unusual data, not an error here.
            <p className="student-parents-missing-phone">
              <span className="pill amber">Thiếu số điện thoại</span>
              <span className="caption muted">Số điện thoại là thông tin bắt buộc của phụ huynh.</span>
            </p>
          )}
        </ContactRow>
        <ContactRow icon="mail" label="Thư điện tử">
          <p className={parent.email ? undefined : 'empty'}>{parent.email || EMPTY_VALUE}</p>
        </ContactRow>
        <ContactRow icon="work" label="Nghề nghiệp">
          <p className={parent.occupation ? undefined : 'empty'}>{parent.occupation || EMPTY_VALUE}</p>
        </ContactRow>
        <ContactRow icon="pin_drop" label="Địa chỉ">
          <p className={parent.address ? undefined : 'empty'}>{parent.address || EMPTY_VALUE}</p>
        </ContactRow>
      </ul>

      {/* otherChildrenCount may be missing from an older response: then the box is not shown. */}
      {typeof others === 'number' && (
        <div className="student-parents-siblings">
          <p className="label-upper">
            <Icon name="diversity_3" size="sm" />
            Liên kết khác trong trường
          </p>
          <p>
            {others > 0
              ? `Còn ${others} con khác đang học tại trường.`
              : 'Phụ huynh này không liên kết với học sinh nào khác.'}
          </p>
        </div>
      )}

      <footer className="student-parents-card-foot">
        {/* UC-13: opens SCR-13, which asks for the confirmation of this parent's unlink. */}
        <button type="button" className="btn btn-danger" onClick={() => onUnlink(parent.parentId)}>
          <Icon name="link_off" size="sm" />
          Gỡ liên kết
        </button>
        {/* TODO UC-106 View Parent Detail (FE-14, Khanh, SCR-10) */}
        <button type="button" className="btn btn-secondary" disabled title={NOT_BUILT}>
          <Icon name="badge" size="sm" />
          Hồ sơ phụ huynh
        </button>
      </footer>
    </article>
  );
}

// SCR-12 Student Parent Detail (UC-12 View Student's Parents), School Manager only.
// Design: Stitch "SCR-11 Student Parent Detail" (the Stitch numbers are one behind docs/screens.md).
// Read only: linking / unlinking is UC-13 (SCR-13) and the parent's own profile is FE-14 (business-rules §2).
// Unlike the parents block of Student Detail, this screen is about the link itself: relationship, link date, the
// parent's other children at the school and whether another parent can still be linked.
export default function StudentParentsPage() {
  const { studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const listSearch = location.state?.listSearch ?? '';
  // fromDetail: Student Detail is the history entry behind this one, so leaving goes back to it.
  const fromDetail = Boolean(location.state?.fromDetail);
  const backTo = `/students${listSearch}`;
  const detailPath = `/students/${studentId}`;
  const detailState = { listSearch: location.state?.listSearch };
  // ASSUMPTION: as in Student Detail, an id that is not a positive integer is "not found" without calling the API.
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
    getStudentParents(studentId, { signal: controller.signal })
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

  function toDetail() {
    if (fromDetail) navigate(-1);
    else navigate(detailPath, { state: detailState });
  }

  // SCR-13 (UC-13). unlinkParentId: the parent whose unlink confirmation SCR-13 opens right away.
  function toEdit(unlinkParentId) {
    navigate(`/students/${studentId}/parents/edit`, {
      state: { listSearch: location.state?.listSearch, fromParents: true, unlinkParentId },
    });
  }

  if (!validId) return <NotFound backTo={backTo} />;
  if (error && (error.status === 404 || error.code === 'MSG_STUDENT_NOT_FOUND' || error.code === 'MSG_INVALID_PARAM')) {
    return <NotFound backTo={backTo} />;
  }
  const crumbs = { backTo, detailPath, detailState };
  if (error) {
    return (
      <div className="student-parents">
        <Breadcrumb {...crumbs} />
        <div className="form-error" role="alert">
          <Icon name="error" size="sm" />
          <p>{loadErrorText(error)}</p>
        </div>
        <div className="actions-row student-parents-retry">
          <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            <Icon name="refresh" size="sm" />
            Thử lại
          </button>
          <button type="button" className="btn btn-tertiary" onClick={toDetail}>
            Quay lại hồ sơ học sinh
          </button>
        </div>
      </div>
    );
  }
  if (loading || !data) return <Skeleton {...crumbs} />;

  const { student, parents, canLinkMore } = data;
  const lastLinkedAt = parents.reduce((latest, p) => (p.linkedAt > latest ? p.linkedAt : latest), '');

  return (
    <div className="student-parents">
      <Breadcrumb {...crumbs} studentCode={student.studentCode} />
      <div className="page-header">
        <div>
          <p className="label-upper student-parents-eyebrow">
            Hồ sơ học sinh <span aria-hidden="true">·</span>{' '}
            <span className="mono">Mã học sinh {student.studentCode}</span>
          </p>
          <h1 className="headline-xl">Thông tin phụ huynh liên kết</h1>
          <p>
            Phụ huynh và người giám hộ của học sinh <span className="strong">{student.fullName}</span>
            {student.className ? ` (Lớp ${student.className})` : ' (Chưa xếp lớp)'}
          </p>
        </div>
        <div className="student-parents-actions">
          <div className="actions-row">
            <button type="button" className="btn btn-secondary" onClick={toDetail}>
              <Icon name="arrow_back" size="sm" />
              Quay lại hồ sơ
            </button>
            {/* UC-13 Link / Unlink Parent–Student (SCR-13). Disabled when 2 parents are linked (business-rules §3). */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => toEdit()}
              disabled={!canLinkMore}
              aria-describedby={canLinkMore ? undefined : 'student-parents-full'}
            >
              <Icon name="add_link" size="sm" />
              Liên kết phụ huynh
            </button>
          </div>
          {!canLinkMore && (
            <p id="student-parents-full" className="caption muted">
              Đã đủ 2 phụ huynh. Gỡ liên kết trước khi thêm.
            </p>
          )}
        </div>
      </div>

      <LinkSummary student={student} parents={parents} canLinkMore={canLinkMore} />

      <div className="student-parents-section-head">
        <h2 className="label-upper">
          Phụ huynh / người giám hộ <span className="chip ink">Tối đa {MAX_PARENTS} người</span>
        </h2>
        {lastLinkedAt && (
          <p className="caption muted">
            Liên kết gần nhất: <span className="mono">{formatDate(lastLinkedAt)}</span>
          </p>
        )}
      </div>

      {parents.length === 0 ? (
        // Normal state, not an error: System Admin creates the parent accounts first, School Manager links them
        // afterwards (business-rules §3).
        <div className="notice student-parents-empty">
          <Icon name="family_restroom" />
          <div>
            <p className="notice-title">Chưa có phụ huynh nào được liên kết</p>
            <p>
              Tài khoản phụ huynh được tạo trước, sau đó nhà trường liên kết với học sinh. Khi có liên kết, thông tin
              phụ huynh sẽ hiển thị tại đây.
            </p>
          </div>
        </div>
      ) : (
        <div className="student-parents-list">
          {parents.map((p) => (
            <ParentCard key={p.parentId} parent={p} onUnlink={(parentId) => toEdit(parentId)} />
          ))}
        </div>
      )}

      <section className="card card-outline student-parents-rules" aria-labelledby="student-parents-rules-title">
        <Icon name="gavel" />
        <div>
          <h2 id="student-parents-rules-title" className="title-sm">
            Quy định liên kết phụ huynh
          </h2>
          <ul>
            <li>Mỗi học sinh được liên kết tối đa 2 phụ huynh hoặc người giám hộ.</li>
            <li>Số điện thoại là thông tin bắt buộc của phụ huynh, dùng để nhận diện phụ huynh có nhiều con.</li>
            <li>Tài khoản phụ huynh không bị xoá, chỉ bị khoá. Phụ huynh bị khoá vẫn giữ liên kết với học sinh.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
