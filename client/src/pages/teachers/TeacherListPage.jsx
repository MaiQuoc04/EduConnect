import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { formatPhone, LIMITS } from '../../utils/teacherValidation.js';
import { useTeachers } from './useTeachers.js';
import './TeacherListPage.css';

// Avatar initials from full name (lấy chữ đầu của từ đầu và từ cuối)
function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'tc-avatar--ink', 'tc-avatar--blue', 'tc-avatar--amber',
  'tc-avatar--green', 'tc-avatar--coral', 'tc-avatar--teal', 'tc-avatar--olive',
];
function avatarColor(code = '') {
  let n = 0;
  for (const c of code) n += c.charCodeAt(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// ── Row menu ─────────────────────────────────────────────────────────────────
function RowMenu({ teacherId, isLocked }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="tc-row-menu" ref={ref}>
      <button
        type="button"
        className="btn btn-icon tc-menu-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="Thao tác"
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <div className="tc-dropdown" role="menu">
          <button
            type="button"
            className="tc-dropdown-item"
            role="menuitem"
            onClick={() => navigate(`/teachers/${teacherId}`)}
          >
            <Icon name="visibility" size="sm" /> Xem chi tiết
          </button>
          <button
            type="button"
            className="tc-dropdown-item"
            role="menuitem"
            onClick={() => navigate(`/teachers/${teacherId}/edit`)}
          >
            <Icon name="edit_note" size="sm" /> Sửa thông tin
          </button>
          {isLocked ? (
            <button type="button" className="tc-dropdown-item tc-dropdown-item--green" role="menuitem">
              <Icon name="lock_open" size="sm" /> Mở khoá hồ sơ
            </button>
          ) : (
            <button type="button" className="tc-dropdown-item tc-dropdown-item--ink" role="menuitem">
              <Icon name="assignment_ind" size="sm" /> Phân công lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, pageSize, onChange }) {
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to   = Math.min(page * pageSize, total);

  // Build page buttons: always show first, last, current ±1
  const pages = new Set([1, totalPages, page, page - 1, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);

  const buttons = [];
  let prev = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) buttons.push('ellipsis-' + p);
    buttons.push(p);
    prev = p;
  }

  return (
    <div className="tc-pagination">
      <span className="tc-pagination-info">
        Hiển thị <strong>{from}–{to}</strong> trong tổng số <strong>{total}</strong> giáo viên
      </span>
      <div className="tc-pagination-controls">
        <button
          type="button"
          className="btn btn-icon"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Trang trước"
        >
          <Icon name="chevron_left" />
        </button>
        {buttons.map((b) =>
          typeof b === 'string' ? (
            <span key={b} className="tc-pagination-ellipsis">…</span>
          ) : (
            <button
              key={b}
              type="button"
              className={`tc-page-btn${b === page ? ' tc-page-btn--active' : ''}`}
              onClick={() => onChange(b)}
            >
              {b}
            </button>
          ),
        )}
        <button
          type="button"
          className="btn btn-icon"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Trang sau"
        >
          <Icon name="chevron_right" />
        </button>
      </div>
    </div>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="tc-skeleton-row">
      {[260, 130, 80, 140, 180, 100, 110, 40].map((w, i) => (
        <td key={i} className="tc-td">
          <span className="tc-skeleton" style={{ width: w * 0.6 + 'px' }} />
        </td>
      ))}
    </tr>
  );
}

// ── Stats cards ───────────────────────────────────────────────────────────────
function StatsCards({ total, loading }) {
  return (
    <div className="tc-stats-grid">
      <div className="tc-stat-card">
        <div>
          <div className="tc-stat-label">Tổng nhân sự</div>
          <div className="tc-stat-value">{loading ? '—' : total}</div>
          <div className="tc-stat-caption">Cán bộ, giáo viên</div>
        </div>
        <div className="tc-stat-icon tc-stat-icon--ink"><Icon name="badge" /></div>
      </div>
      <div className="tc-stat-card">
        <div>
          <div className="tc-stat-label">Đang chủ nhiệm</div>
          <div className="tc-stat-value">—</div>
          <div className="tc-stat-caption tc-text-green">Đạt 100% chỉ tiêu lớp</div>
        </div>
        <div className="tc-stat-icon tc-stat-icon--green"><Icon name="assignment_turned_in" /></div>
      </div>
      <div className="tc-stat-card">
        <div>
          <div className="tc-stat-label">Tải giờ TB</div>
          <div className="tc-stat-value">— <span className="tc-stat-unit">tiết/tuần</span></div>
          <div className="tc-stat-caption">Định mức chuẩn: 18 tiết</div>
        </div>
        <div className="tc-stat-icon tc-stat-icon--blue"><Icon name="timelapse" /></div>
      </div>
      <div className="tc-stat-card">
        <div>
          <div className="tc-stat-label">Hồ sơ đã khoá</div>
          <div className="tc-stat-value tc-text-red">—</div>
          <div className="tc-stat-caption">Tạm ngưng công tác</div>
        </div>
        <div className="tc-stat-icon tc-stat-icon--red"><Icon name="lock" /></div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TeacherListPage() {
  const {
    teachers, total, totalPages, page, setPage,
    loading, error,
    search, setSearch,
    filterSubject, setFilterSubject,
    filterHomeroom, setFilterHomeroom,
    filterStatus, setFilterStatus,
    resetFilters,
  } = useTeachers();

  const searchRef = useRef(null);

  // ⌘K / Ctrl+K focus search
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="tc-page">
      {/* ── Header ── */}
      <div className="tc-page-header">
        <div className="tc-breadcrumb">
          <span>EduConnect</span>
          <span className="tc-sep">/</span>
          <span>Hồ sơ</span>
          <span className="tc-sep">/</span>
          <strong>Giáo viên</strong>
        </div>
        <div className="tc-header-meta">
          <span className="stamp-badge">SCR-13</span>
          <span className="tc-sep">·</span>
          <span className="tc-meta-label">Niên khoá 2026–2027</span>
        </div>
      </div>

      <div className="tc-title-row">
        <div>
          <div className="tc-title-group">
            <h1 className="tc-title">Giáo viên</h1>
            {!loading && (
              <span className="tc-title-count">
                Tổng số: <strong>{total}</strong> cán bộ
              </span>
            )}
          </div>
          <p className="tc-subtitle">
            Danh sách cán bộ giáo viên niên khoá 2026–2027 · Quản lý hồ sơ chuyên môn và phân công giảng dạy
          </p>
        </div>
        <button type="button" className="btn btn-secondary tc-export-btn">
          <Icon name="download" size="sm" /> Xuất danh sách (.xlsx)
        </button>
      </div>

      {/* ── Stats ── */}
      <StatsCards total={total} loading={loading} />

      {/* ── Filters ── */}
      <div className="tc-filter-bar">
        <div className="tc-search-wrap">
          <Icon name="search" className="tc-search-icon" />
          <input
            ref={searchRef}
            type="text"
            className="tc-search-input"
            placeholder="Tìm theo họ tên (có hoặc không dấu), mã GV, email, số điện thoại…"
            maxLength={LIMITS.SEARCH_MAX}
            aria-label="Tìm giáo viên"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <kbd className="tc-search-kbd">⌘K</kbd>
        </div>
        <div className="tc-filter-controls">
          <div className="select-wrap">
            <select
              value={filterSubject}
              onChange={(e) => { setFilterSubject(e.target.value); setPage(1); }}
            >
              <option value="">Môn dạy: Tất cả</option>
              <option value="Toán">Toán học</option>
              <option value="Ngữ văn">Ngữ văn</option>
              <option value="Tiếng Anh">Tiếng Anh</option>
              <option value="Vật lý">Vật lý</option>
              <option value="Hóa học">Hóa học</option>
              <option value="Sinh học">Sinh học</option>
              <option value="Tin học">Tin học</option>
              <option value="Lịch sử">Lịch sử</option>
              <option value="Địa lý">Địa lý</option>
            </select>
            <Icon name="expand_more" className="select-icon" />
          </div>
          <div className="select-wrap">
            <select
              value={filterHomeroom}
              onChange={(e) => { setFilterHomeroom(e.target.value); setPage(1); }}
            >
              <option value="">Chủ nhiệm: Tất cả</option>
              <option value="has">Có chủ nhiệm</option>
              <option value="none">Không chủ nhiệm</option>
            </select>
            <Icon name="expand_more" className="select-icon" />
          </div>
          <div className="select-wrap">
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            >
              <option value="">Trạng thái: Tất cả</option>
              <option value="ACTIVE">Đang công tác</option>
              <option value="LOCKED">Đã khoá</option>
            </select>
            <Icon name="expand_more" className="select-icon" />
          </div>
          <button
            type="button"
            className="btn btn-icon"
            onClick={resetFilters}
            title="Đặt lại bộ lọc"
          >
            <Icon name="restart_alt" />
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="tc-error-banner">
          <Icon name="error_outline" /> {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="tc-table-card">
        <div className="tc-table-scroll">
          <table className="tc-table">
            <thead>
              <tr>
                <th className="tc-th" style={{ width: 260 }}>Mã GV &amp; Họ tên</th>
                <th className="tc-th" style={{ width: 160 }}>Môn chuyên môn</th>
                <th className="tc-th" style={{ width: 110 }}>Chủ nhiệm</th>
                <th className="tc-th" style={{ width: 170 }}>Số lớp đang dạy</th>
                <th className="tc-th">Email trường cấp</th>
                <th className="tc-th" style={{ width: 130 }}>Điện thoại</th>
                <th className="tc-th" style={{ width: 140 }}>Trạng thái</th>
                <th className="tc-th tc-th--right" style={{ width: 60 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                : teachers.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="tc-empty">
                        <Icon name="search_off" />
                        <span>Không tìm thấy giáo viên nào phù hợp.</span>
                      </td>
                    </tr>
                  )
                  : teachers.map((t) => {
                    const isLocked = t.status === 'LOCKED';
                    return (
                      <tr key={t.teacherId} className={`tc-row${isLocked ? ' tc-row--locked' : ''}`}>
                        {/* Avatar + Name */}
                        <td className="tc-td">
                          <div className="tc-identity">
                            <div className={`tc-avatar ${avatarColor(t.teacherCode)}`}>
                              {initials(t.fullName)}
                            </div>
                            <div>
                              <Link to={`/teachers/${t.teacherId}`} className="tc-name tc-name-link">
                                {t.fullName}
                              </Link>
                              <div className="tc-code">{t.teacherCode}</div>
                            </div>
                          </div>
                        </td>
                        {/* Subjects */}
                        <td className="tc-td">
                          <div className="tc-tags">
                            {(t.subjects ?? []).map((s) => (
                              <span key={s} className="tc-tag tc-tag--ink">{s}</span>
                            ))}
                          </div>
                        </td>
                        {/* Homeroom */}
                        <td className="tc-td">
                          {t.homeroomClass
                            ? <span className="tc-tag tc-tag--green">{t.homeroomClass}</span>
                            : <span className="tc-dash">—</span>}
                        </td>
                        {/* Classes */}
                        <td className="tc-td">
                          {t.classCount != null ? (
                            <>
                              <strong>{t.classCount} lớp</strong>
                              {t.periodsPerWeek != null && (
                                <span className="tc-muted"> ({t.periodsPerWeek} tiết/tuần)</span>
                              )}
                            </>
                          ) : <span className="tc-dash">—</span>}
                        </td>
                        {/* Email */}
                        <td className="tc-td tc-mono">
                          <span className={isLocked ? 'tc-strikethrough' : ''}>{t.email ?? '—'}</span>
                        </td>
                        {/* Phone */}
                        <td className="tc-td tc-mono">{t.phone ? formatPhone(t.phone) : '—'}</td>
                        {/* Status */}
                        <td className="tc-td">
                          {isLocked ? (
                            <div className="tc-status tc-status--locked">
                              <span className="tc-dot tc-dot--red" />
                              Đã khoá
                            </div>
                          ) : (
                            <div className="tc-status">
                              <span className="tc-dot tc-dot--green" />
                              Đang công tác
                            </div>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="tc-td tc-td--right">
                          <RowMenu teacherId={t.teacherId} isLocked={isLocked} />
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!loading && teachers.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={10}
            onChange={setPage}
          />
        )}
      </div>

      {/* ── Admin note ── */}
      <div className="tc-admin-note">
        <Icon name="info" className="tc-note-icon" />
        <p>
          <strong>Lưu ý quản trị tài khoản:</strong>{' '}
          Tài khoản cán bộ giáo viên được khởi tạo tập trung bởi Quản trị viên hệ thống (System Admin).
          Quản lý trường học thực hiện cập nhật phân công bộ môn, lớp chủ nhiệm và rà soát trạng thái hoạt động
          giảng dạy theo phân cấp.
        </p>
      </div>
    </div>
  );
}
