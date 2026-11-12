import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { listParents } from '../../api/parents.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import './ParentListPage.css';

// Same paging, search delay and labels as the Student List (SCR-07), so both record lists behave alike.
const PAGE_SIZES = [20, 50, 100]; // the API allows at most 100
const SEARCH_DELAY_MS = 350;
const ACCOUNT_LABELS = { ACTIVE: 'Hoạt động', LOCKED: 'Đã khoá' };
const CHILDREN_LABELS = { yes: 'Đã liên kết con', no: 'Chưa liên kết con' };
const SUMMARY_NAMES = 2; // children named in a row; the rest becomes "+N"
const GENERIC_ERROR = 'Không tải được danh sách phụ huynh. Vui lòng thử lại.';
const EMPTY_RESULT = 'Không có kết quả.'; // MSG01
const EMPTY_VALUE = 'Chưa cập nhật';

const number = (n) => n.toLocaleString('vi-VN');

// Filters live in the URL (?q=&hasChildren=&accountStatus=&page=&pageSize=), so a refresh or a shared link shows the
// same list. Values the API would reject are dropped here (the server refuses unknown values with 400).
function readFilters(sp) {
  const oneOf = (key, allowed) => (allowed.includes(sp.get(key)) ? sp.get(key) : '');
  const page = Number(sp.get('page'));
  const pageSize = Number(sp.get('pageSize'));
  return {
    q: (sp.get('q') ?? '').slice(0, 100),
    hasChildren: oneOf('hasChildren', Object.keys(CHILDREN_LABELS)),
    accountStatus: oneOf('accountStatus', Object.keys(ACCOUNT_LABELS)),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    // As on the Student List: only the offered page sizes are accepted from the URL; anything else falls back to 20.
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : PAGE_SIZES[0],
  };
}

// Vietnamese text for an API error. Codes missing from messages.js get a general message instead of the English
// server text (same rule as the Student List).
function loadErrorText(err) {
  const generic = errorText({ code: 'SERVER_ERROR' });
  const text = errorText({ code: err.code, details: err.details });
  if (text === generic && err.code !== 'SERVER_ERROR') {
    console.warn(`[ParentList] No Vietnamese message for error code ${err.code}:`, err.message);
    return GENERIC_ERROR;
  }
  return text;
}

// Page numbers with gaps: 1 … 4 5 6 … 62 (same as the Student List)
function pageList(page, totalPages) {
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages.at(-1) !== '…') pages.push('…');
  }
  return pages;
}

// Number of linked children. There is no limit per parent (business-rules §3: the limit of 2 is per student), so the
// count is shown alone, not as "x/2". 0 is what School Manager has to follow up: accounts are created first and
// linked afterwards (business-rules §3).
function ChildrenCount({ count }) {
  if (count === 0) return <span className="parent-list-children none">Chưa liên kết</span>;
  return <span className="parent-list-children mono">{count}</span>;
}

// The children's names, short: the first SUMMARY_NAMES, then "+N". The full list is in the tooltip.
function ChildrenNames({ items }) {
  if (!items.length) return <span className="muted">—</span>;
  const shown = items.slice(0, SUMMARY_NAMES);
  const rest = items.length - shown.length;
  const full = items.map((c) => `${c.fullName} (${c.studentCode})`).join(', ');
  return (
    <span className="parent-list-names" title={full}>
      <span className="parent-list-names-text">{shown.map((c) => c.fullName).join(', ')}</span>
      {rest > 0 && <span className="chip">+{rest}</span>}
    </span>
  );
}

function SkeletonRows({ count }) {
  return Array.from({ length: count }, (_, i) => (
    <tr key={i} className="parent-list-skeleton" aria-hidden="true">
      {Array.from({ length: 7 }, (__, j) => (
        <td key={j}>
          <span />
        </td>
      ))}
    </tr>
  ));
}

// SCR-69 Parent List (UC-104 View Parent List), School Manager only. Same layout and behaviour as the Student List
// (SCR-07): search with a short delay, filters in the URL, a filter change goes back to page 1, 20 / 50 / 100 rows.
export default function ParentListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = readFilters(searchParams);
  const query = searchParams.toString();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    listParents({ ...f, q: f.q.trim() }, { signal: controller.signal })
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

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const items = result?.items ?? [];
  const from = items.length ? (filters.page - 1) * filters.pageSize + 1 : 0;
  const to = items.length ? from + items.length - 1 : 0;

  return (
    <div className="parent-list">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<span className="current">Phụ huynh</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Phụ huynh</h1>
          <p>Quản lý hồ sơ phụ huynh và các con đang liên kết.</p>
        </div>
      </div>

      <section className="card card-outline parent-list-filters" aria-label="Bộ lọc phụ huynh">
        <div className="parent-list-controls">
          <div className="parent-list-search">
            <Icon name="search" size="sm" />
            <input
              type="search"
              className="input"
              value={qInput}
              maxLength={100}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Tìm theo tên hoặc số điện thoại…"
              aria-label="Tìm theo tên hoặc số điện thoại"
            />
          </div>
          <select
            className="input"
            value={filters.hasChildren}
            onChange={(e) => updateFilters({ hasChildren: e.target.value })}
            aria-label="Liên kết con"
          >
            <option value="">Tất cả liên kết</option>
            {Object.entries(CHILDREN_LABELS).map(([value, label]) => (
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
        </div>
        <div className="parent-list-total">
          <span className="caption muted">Tổng cộng:</span>
          <span className="parent-list-count mono">{loading && !result ? '…' : `${number(total)} phụ huynh`}</span>
        </div>
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <section className="card card-outline parent-list-table" aria-busy={loading}>
          <div className="parent-list-scroll">
            <table className={`table${loading && result ? ' is-refreshing' : ''}`}>
              <thead>
                <tr>
                  <th className="sticky">Họ và tên</th>
                  <th>Số điện thoại</th>
                  <th>Email</th>
                  <th>Nghề nghiệp</th>
                  <th className="num">Số con</th>
                  <th>Con đang liên kết</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {loading && !result && <SkeletonRows count={5} />}
                {result && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="parent-list-empty">
                      {EMPTY_RESULT}
                    </td>
                  </tr>
                )}
                {items.map((p) => {
                  const locked = p.accountStatus === 'LOCKED';
                  // UC-105: the name links to Parent Detail (SCR-10); the rest of the row is a mouse shortcut. The
                  // list's query string goes along so the detail page returns to the same filters and page.
                  const detailPath = `/parents/${p.parentId}`;
                  const detailState = { listSearch: query ? `?${query}` : '' };
                  const openDetail = (e) => {
                    if (e.target.closest('a, button')) return;
                    navigate(detailPath, { state: detailState });
                  };
                  return (
                    <tr
                      key={p.parentId}
                      className={`is-clickable${locked ? ' is-locked' : ''}`}
                      onClick={openDetail}
                    >
                      <td className="sticky">
                        <div className="parent-list-name">
                          <Avatar src={p.avatarUrl} name={p.fullName} size={24} square />
                          <Link to={detailPath} state={detailState}>
                            {p.fullName}
                          </Link>
                        </div>
                      </td>
                      {/* The phone identifies a parent with several children (business-rules §3). */}
                      <td className="mono parent-list-phone">{p.phone || <span className="muted">{EMPTY_VALUE}</span>}</td>
                      <td className="caption">{p.email || <span className="muted">—</span>}</td>
                      <td className="caption">{p.occupation || <span className="muted">—</span>}</td>
                      <td className="num">
                        <ChildrenCount count={p.childrenCount} />
                      </td>
                      <td>
                        <ChildrenNames items={p.childrenSummary ?? []} />
                      </td>
                      <td>
                        {/* Locked accounts stay in the list: accounts are never deleted (business-rules §3). */}
                        <span className={`pill${locked ? '' : ' green'}`}>
                          {ACCOUNT_LABELS[p.accountStatus] ?? p.accountStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="parent-list-pager">
            <p className="caption muted">
              Hiển thị{' '}
              <span className="mono strong">
                {number(from)}–{number(to)}
              </span>{' '}
              trong <span className="mono strong">{number(total)}</span> phụ huynh
            </p>
            <div className="parent-list-pager-controls">
              <label className="caption muted parent-list-page-size">
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
              <nav className="parent-list-pages" aria-label="Phân trang">
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
              <span className="caption muted parent-list-page-of">
                Trang {filters.page} / {totalPages}
              </span>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}
