import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchClassOptions, listStudents } from '../../api/students.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import './StudentListPage.css';

const PAGE_SIZES = [20, 50, 100]; // the API allows at most 100
const SEARCH_DELAY_MS = 350;
const ENROLLMENT_LABELS = { STUDYING: 'Đang học', TRANSFERRED: 'Đã chuyển lớp', DROPPED: 'Đã nghỉ học' };
const ACCOUNT_LABELS = { ACTIVE: 'Hoạt động', LOCKED: 'Đã khoá' };
const MAX_PARENTS = 2; // business-rules §3
const GENERIC_ERROR = 'Không tải được danh sách học sinh. Vui lòng thử lại.';
const EMPTY_RESULT = 'Không có kết quả.'; // MSG01

const number = (n) => n.toLocaleString('vi-VN');

// Filters live in the URL (?q=&classId=&status=&accountStatus=&unassigned=&schoolYearId=&page=&pageSize=), so a
// refresh or a shared link shows the same list. Values the API would reject are dropped here.
function readFilters(sp) {
  const id = (key) => (/^\d+$/.test(sp.get(key) ?? '') ? sp.get(key) : '');
  const oneOf = (key, allowed) => (allowed.includes(sp.get(key)) ? sp.get(key) : '');
  const unassigned = sp.get('unassigned') === 'true';
  const page = Number(sp.get('page'));
  const pageSize = Number(sp.get('pageSize'));
  return {
    q: (sp.get('q') ?? '').slice(0, 100),
    classId: unassigned ? '' : id('classId'),
    status: unassigned ? '' : oneOf('status', Object.keys(ENROLLMENT_LABELS)),
    accountStatus: oneOf('accountStatus', Object.keys(ACCOUNT_LABELS)),
    unassigned,
    schoolYearId: id('schoolYearId'), // no selector in the design; kept so links to another year still work
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    // ASSUMPTION: only the offered page sizes are accepted from the URL; anything else falls back to 20.
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : PAGE_SIZES[0],
  };
}

// Vietnamese text for an API error. Codes missing from messages.js (e.g. MSG_INVALID_PARAM, MSG_CLASS_NOT_FOUND,
// MSG_SCHOOL_YEAR_NOT_FOUND, waiting for approval) get a general message instead of the English server text.
function loadErrorText(err) {
  const generic = errorText({ code: 'SERVER_ERROR' });
  const text = errorText({ code: err.code, details: err.details });
  if (text === generic && err.code !== 'SERVER_ERROR') {
    console.warn(`[StudentList] No Vietnamese message for error code ${err.code}:`, err.message);
    return GENERIC_ERROR;
  }
  return text;
}

// Page numbers with gaps: 1 … 4 5 6 … 62
function pageList(page, totalPages) {
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages.at(-1) !== '…') pages.push('…');
  }
  return pages;
}

function ParentCount({ count }) {
  if (count === 0) {
    return (
      <span className="student-list-parents none">
        0/{MAX_PARENTS} · Chưa liên kết
      </span>
    );
  }
  return (
    <span className="student-list-parents mono">
      {count}/{MAX_PARENTS}
    </span>
  );
}

function ClassCell({ student }) {
  if (!student.classId) return <span className="muted">Chưa xếp lớp</span>;
  return (
    <div className="student-list-class">
      <span>{student.className}</span>
      {student.enrollmentStatus !== 'STUDYING' && (
        <span className="chip">{ENROLLMENT_LABELS[student.enrollmentStatus] ?? student.enrollmentStatus}</span>
      )}
    </div>
  );
}

function SkeletonRows({ count }) {
  return Array.from({ length: count }, (_, i) => (
    <tr key={i} className="student-list-skeleton" aria-hidden="true">
      {Array.from({ length: 8 }, (__, j) => (
        <td key={j}>
          <span />
        </td>
      ))}
    </tr>
  ));
}

// SCR-07 Student List (UC-07 View Student List), School Manager only.
export default function StudentListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = readFilters(searchParams);
  const query = searchParams.toString();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classOptions, setClassOptions] = useState([]);

  // Search box: typed text goes to the URL after a short pause; the URL value is copied back when it changes
  // from outside (back button, pasted link).
  const [qInput, setQInput] = useState(filters.q);
  const lastWrittenQ = useRef(filters.q);
  useEffect(() => {
    if (filters.q !== lastWrittenQ.current) {
      lastWrittenQ.current = filters.q;
      setQInput(filters.q);
    }
  }, [filters.q]);

  // Every filter change goes back to page 1. Starts from the address bar, not from the searchParams of this render:
  // the debounced search and a select changed meanwhile would otherwise overwrite each other's filter.
  function updateFilters(changes, { replace = false } = {}) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === false || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next, { replace });
  }

  useEffect(() => {
    if (qInput === filters.q) return undefined;
    const timer = setTimeout(() => {
      lastWrittenQ.current = qInput;
      updateFilters({ q: qInput }, { replace: true });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  // Load the list whenever the URL changes; a newer request cancels the previous one so results never jump back.
  useEffect(() => {
    const controller = new AbortController();
    const f = readFilters(new URLSearchParams(query));
    setLoading(true);
    listStudents(f, { signal: controller.signal })
      .then((data) => {
        setResult(data);
        setError('');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setResult(null);
        setError(loadErrorText(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    let alive = true;
    fetchClassOptions(filters.schoolYearId || undefined)
      .then((options) => alive && setClassOptions(options))
      .catch(() => alive && setClassOptions([]));
    return () => {
      alive = false;
    };
  }, [filters.schoolYearId]);

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const items = result?.items ?? [];
  const from = items.length ? (filters.page - 1) * filters.pageSize + 1 : 0;
  const to = items.length ? from + items.length - 1 : 0;

  const grades = [...new Set(classOptions.map((c) => c.gradeLevelName))];
  const selectedClassMissing = filters.classId && !classOptions.some((c) => String(c.id) === filters.classId);

  return (
    <div className="student-list">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<span className="current">Học sinh</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Học sinh</h1>
          <p>Quản lý hồ sơ học sinh toàn trường.</p>
        </div>
        <div className="actions-row">
          {/* TODO UC-14 Import Parent–Student Links (SCR-07 import dialog) */}
          <button type="button" className="btn btn-secondary" disabled title="Chức năng đang được xây dựng">
            <Icon name="upload_file" size="sm" />
            Nhập liên kết phụ huynh
          </button>
          {/* SCR-11: opens the promotion tab (UC-11, a whole class). A transfer (UC-10) is for one student, so it
              starts from Student Detail ("Chuyển lớp"). */}
          <Link to="/students/promote" state={{ listSearch: query ? `?${query}` : '' }} className="btn btn-secondary">
            <Icon name="swap_horiz" size="sm" />
            Chuyển lớp / Lên lớp
          </Link>
        </div>
      </div>

      <section className="card card-outline student-list-filters" aria-label="Bộ lọc học sinh">
        <div className="student-list-controls">
          <div className="student-list-search">
            <Icon name="search" size="sm" />
            <input
              type="search"
              className="input"
              value={qInput}
              maxLength={100}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Tìm theo tên hoặc mã học sinh…"
              aria-label="Tìm theo tên hoặc mã học sinh"
            />
          </div>
          <select
            className="input"
            value={filters.classId}
            onChange={(e) => updateFilters({ classId: e.target.value })}
            disabled={filters.unassigned}
            aria-label="Lớp"
          >
            <option value="">Tất cả các lớp</option>
            {selectedClassMissing && <option value={filters.classId}>Lớp đã chọn</option>}
            {grades.map((grade) => (
              <optgroup key={grade} label={`Khối ${grade}`}>
                {classOptions
                  .filter((c) => c.gradeLevelName === grade)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {/* ASSUMPTION: not in the design; the API filters by enrollment status, so it gets its own select. */}
          <select
            className="input"
            value={filters.status}
            onChange={(e) => updateFilters({ status: e.target.value })}
            disabled={filters.unassigned}
            aria-label="Trạng thái học tập"
          >
            <option value="">Mọi trạng thái học tập</option>
            {Object.entries(ENROLLMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.accountStatus}
            onChange={(e) => updateFilters({ accountStatus: e.target.value })}
            aria-label="Trạng thái tài khoản"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(ACCOUNT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {/* Students with an account but no class this year (business-rules §3: SA creates accounts, SM imports
              classes later). The API rejects it together with a class or an enrollment status. */}
          <label className="student-list-toggle">
            <input
              type="checkbox"
              checked={filters.unassigned}
              onChange={(e) =>
                updateFilters(e.target.checked ? { unassigned: true, classId: '', status: '' } : { unassigned: false })
              }
            />
            Chưa xếp lớp
          </label>
        </div>
        <div className="student-list-total">
          <span className="caption muted">Tổng cộng:</span>
          <span className="student-list-count mono">{loading && !result ? '…' : `${number(total)} học sinh`}</span>
        </div>
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <section className="card card-outline student-list-table" aria-busy={loading}>
          <div className="student-list-scroll">
            <table className={`table${loading && result ? ' is-refreshing' : ''}`}>
              <thead>
                <tr>
                  <th className="num">Mã HS</th>
                  <th className="sticky">Họ và tên</th>
                  <th>Tên đăng nhập</th>
                  <th className="num">Ngày sinh</th>
                  <th>Lớp</th>
                  <th>Phụ huynh liên kết</th>
                  <th>Trạng thái</th>
                  <th className="num">
                    <span className="visually-hidden">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && !result && <SkeletonRows count={5} />}
                {result && items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="student-list-empty">
                      {EMPTY_RESULT}
                    </td>
                  </tr>
                )}
                {items.map((s) => {
                  const locked = s.accountStatus === 'LOCKED';
                  // UC-08: the name links to Student Detail (SCR-08); the rest of the row is a mouse shortcut. The
                  // list's query string goes along so the detail page returns to the same filters and page.
                  const detailPath = `/students/${s.studentId}`;
                  const detailState = { listSearch: query ? `?${query}` : '' };
                  const openDetail = (e) => {
                    if (e.target.closest('a, button')) return;
                    navigate(detailPath, { state: detailState });
                  };
                  return (
                    <tr
                      key={`${s.studentId}-${s.classId ?? 'none'}`}
                      className={`is-clickable${locked ? ' is-locked' : ''}`}
                      onClick={openDetail}
                    >
                      <td className="num mono caption">{s.studentCode}</td>
                      <td className="sticky">
                        <div className="student-list-name">
                          <Avatar src={s.avatarUrl} name={s.fullName} size={24} square />
                          <Link to={detailPath} state={detailState}>
                            {s.fullName}
                          </Link>
                        </div>
                      </td>
                      {/* Read only: only System Admin changes a username (business-rules §3, UC-99). */}
                      <td className="mono caption">{s.username}</td>
                      <td className="num mono caption">{formatDate(s.dob)}</td>
                      <td>
                        <ClassCell student={s} />
                      </td>
                      <td>
                        <ParentCount count={s.parentCount} />
                      </td>
                      <td>
                        <span className={`pill${locked ? '' : ' green'}`}>
                          {ACCOUNT_LABELS[s.accountStatus] ?? s.accountStatus}
                        </span>
                      </td>
                      <td className="num">
                        {/* TODO UC-09 / UC-10: row actions (update, transfer) */}
                        <button type="button" className="btn btn-icon" disabled aria-label={`Thao tác với ${s.fullName}`}>
                          <Icon name="more_horiz" size="sm" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="student-list-pager">
            <p className="caption muted">
              Hiển thị{' '}
              <span className="mono strong">
                {number(from)}–{number(to)}
              </span>{' '}
              trong <span className="mono strong">{number(total)}</span> học sinh
            </p>
            <div className="student-list-pager-controls">
              {/* ASSUMPTION: rows-per-page selector is not in the design (20 / 50 / 100, API max 100). */}
              <label className="caption muted student-list-page-size">
                Số dòng
                <select
                  className="input"
                  value={filters.pageSize}
                  onChange={(e) => updateFilters({ pageSize: e.target.value === '20' ? '' : e.target.value })}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <nav className="student-list-pages" aria-label="Phân trang">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={filters.page <= 1}
                  onClick={() => updateFilters({ page: filters.page - 1 })}
                  aria-label="Trang trước"
                >
                  <Icon name="chevron_left" size="sm" />
                </button>
                {pageList(filters.page, totalPages).map((p, i) =>
                  p === '…' ? (
                    <span key={`gap-${i}`} className="gap">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`btn mono${p === filters.page ? ' current' : ''}`}
                      aria-current={p === filters.page ? 'page' : undefined}
                      onClick={() => updateFilters({ page: p === 1 ? '' : p })}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={filters.page >= totalPages}
                  onClick={() => updateFilters({ page: filters.page + 1 })}
                  aria-label="Trang sau"
                >
                  <Icon name="chevron_right" size="sm" />
                </button>
              </nav>
              <span className="caption muted student-list-page-of">
                Trang {filters.page} / {totalPages}
              </span>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}
