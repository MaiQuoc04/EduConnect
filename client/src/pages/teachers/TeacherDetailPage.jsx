import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { formatDate } from '../../utils/format.js';
import { useTeacherDetail } from './useTeacherDetail.js';
import './TeacherDetailPage.css';

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

// Date arithmetic on 'YYYY-MM-DD' strings, only for moving the schedule week in the UI.
function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const shortDate = (iso) => formatDate(iso).slice(0, 5); // dd/mm

// ── Actions menu ────────────────────────────────────────────────────────────
// Reset password / lock / unlock belong to FE-13 (business-rules §3) – shown but not wired yet.
function ActionsMenu({ isLocked, tempLocked }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handler(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="td-menu" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary td-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Thao tác khác"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more_horiz" />
      </button>
      {open && (
        <div className="td-dropdown" role="menu">
          <button type="button" className="td-dropdown-item" role="menuitem" disabled>
            <Icon name="lock_reset" size="sm" /> Đặt lại mật khẩu <span className="td-soon">Sắp có</span>
          </button>
          {tempLocked && (
            <button type="button" className="td-dropdown-item" role="menuitem" disabled>
              <Icon name="lock_open_right" size="sm" /> Mở tạm khoá đăng nhập <span className="td-soon">Sắp có</span>
            </button>
          )}
          <div className="td-dropdown-sep" />
          {isLocked ? (
            <button type="button" className="td-dropdown-item td-dropdown-item--green" role="menuitem" disabled>
              <Icon name="lock_open" size="sm" /> Mở khoá tài khoản <span className="td-soon">Sắp có</span>
            </button>
          ) : (
            <button type="button" className="td-dropdown-item td-dropdown-item--red" role="menuitem" disabled>
              <Icon name="lock_person" size="sm" /> Khoá tài khoản <span className="td-soon">Sắp có</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Header card ─────────────────────────────────────────────────────────────
function HeaderCard({ teacher, schoolYear }) {
  const isLocked = teacher.status === 'LOCKED';
  return (
    <section className="td-card td-header">
      <div className="td-identity">
        <div className="td-avatar-wrap">
          <Avatar src={teacher.avatarUrl} name={teacher.fullName} size={80} square />
          <span
            className={`td-status-dot ${isLocked ? 'td-status-dot--red' : 'td-status-dot--green'}`}
            title={isLocked ? 'Đã khoá' : 'Đang công tác'}
          />
        </div>
        <div className="td-identity-text">
          <div className="td-name-row">
            <h1 className="headline-lg td-name">{teacher.fullName}</h1>
            <span className="td-username">@{teacher.username}</span>
          </div>
          <div className="td-meta-row">
            <span className="td-code">Mã GV: {teacher.teacherCode}</span>
            {teacher.department && (
              <>
                <span className="td-dot-sep">•</span>
                <span>{teacher.department}</span>
              </>
            )}
          </div>
          <div className="td-tags">
            {teacher.subjects.map((s) => (
              <span key={s.subjectId} className="td-tag td-tag--ink">{s.name}</span>
            ))}
            {teacher.homeroomClasses.map((c) => (
              <span key={c.classId} className="td-tag td-tag--amber">GVCN {c.className}</span>
            ))}
            {isLocked
              ? <span className="pill red">Đã khoá</span>
              : <span className="pill green">Đang công tác</span>}
          </div>
        </div>
      </div>

      <div className="td-header-actions">
        {schoolYear && <span className="stamp">Hồ sơ chính thức · {schoolYear}</span>}
        <div className="td-button-row">
          <Link to={`/teachers/${teacher.teacherId}/edit`} className="btn btn-secondary">
            <Icon name="edit" size="sm" /> Sửa thông tin
          </Link>
          <ActionsMenu isLocked={isLocked} tempLocked={teacher.tempLocked} />
        </div>
      </div>
    </section>
  );
}

// ── Locked warning (business-rules §4: SM reassigns homeroom / subject teaching) ──
function LockedNotice({ teacherId, hasHomeroom, hasTeaching }) {
  return (
    <section className="td-locked" role="alert">
      <div className="td-locked-body">
        <span className="td-locked-icon"><Icon name="warning" /></span>
        <div>
          <div className="td-locked-title">
            Giáo viên đã bị khoá tài khoản <span className="td-locked-badge">Khoá hệ thống</span>
          </div>
          <p>
            {hasTeaching || hasHomeroom
              ? 'Hãy phân công lại các lớp đang dạy và lớp chủ nhiệm để không làm gián đoạn lịch học của học sinh.'
              : 'Giáo viên hiện không còn lớp giảng dạy hay lớp chủ nhiệm trong năm học này.'}
          </p>
        </div>
      </div>
      {(hasTeaching || hasHomeroom) && (
        <div className="td-button-row">
          {hasTeaching && (
            <Link to={`/teaching-assignments?teacherId=${teacherId}`} className="btn btn-secondary">
              Phân công lại giảng dạy
            </Link>
          )}
          {hasHomeroom && (
            <Link to="/homeroom-assignments?status=locked" className="btn btn-primary">
              Phân công lại GVCN
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

// ── Left column ─────────────────────────────────────────────────────────────
function InfoRow({ label, children, mono }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="td-info-row">
      <span className="td-info-label">{label}</span>
      <span className={`td-info-value${mono ? ' td-mono' : ''}${empty ? ' td-empty' : ''}`}>
        {empty ? 'Chưa cập nhật' : children}
      </span>
    </div>
  );
}

function PersonalCard({ teacher }) {
  return (
    <section className="td-card">
      <div className="td-card-head">
        <h2 className="title-sm">Thông tin cá nhân &amp; liên hệ</h2>
        <Icon name="badge" className="td-card-icon" />
      </div>
      <div className="td-info">
        <InfoRow label="Họ và tên">{teacher.fullName}</InfoRow>
        <InfoRow label="Tên đăng nhập" mono>{teacher.username}</InfoRow>
        <InfoRow label="Email" mono>{teacher.email}</InfoRow>
        <InfoRow label="Số điện thoại" mono>{teacher.phone}</InfoRow>
        <InfoRow label="Tổ chuyên môn">{teacher.department}</InfoRow>
        <InfoRow label="Môn có thể dạy">
          {teacher.subjects.length ? teacher.subjects.map((s) => s.name).join(', ') : null}
        </InfoRow>
        <InfoRow label="Ngày tạo tài khoản">{formatDate(teacher.createdAt)}</InfoRow>
      </div>
      {teacher.tempLocked && (
        <div className="notice amber td-temp-lock">
          <Icon name="schedule" />
          <div>Tài khoản đang bị tạm khoá đăng nhập do nhập sai mật khẩu nhiều lần.</div>
        </div>
      )}
    </section>
  );
}

function WorkloadCard({ workload, assignments }) {
  const active = assignments.filter((a) => a.isActive);
  const byClass = {};
  for (const a of active) byClass[a.className] = (byClass[a.className] ?? 0) + (a.periodsPerWeek ?? 0);
  const max = Math.max(1, ...Object.values(byClass));

  return (
    <section className="td-card">
      <div className="td-card-head">
        <span className="label-upper">Tải giảng dạy hiện tại</span>
        <Icon name="timelapse" className="td-card-icon" />
      </div>
      <div className="td-workload-value">
        {workload.periodsPerWeek} <span>tiết/tuần</span>
      </div>
      <p className="td-caption">
        {workload.classCount} lớp · {active.length} phân công đang hiệu lực
      </p>
      {active.length > 0 && (
        <ul className="td-bars">
          {Object.entries(byClass).map(([cls, periods]) => (
            <li key={cls}>
              <span className="td-bar-label">{cls}</span>
              <span className="td-bar-track">
                <span className="td-bar-fill" style={{ width: `${(periods / max) * 100}%` }} />
              </span>
              <span className="td-bar-value">{periods}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Assignments table ───────────────────────────────────────────────────────
function AssignmentsCard({ assignments, schoolYear, workload }) {
  return (
    <section className="td-card td-card--flush">
      <div className="td-card-head td-card-head--padded">
        <div>
          <h2 className="title-sm">Phân công giảng dạy{schoolYear ? ` năm học ${schoolYear}` : ''}</h2>
          <p className="td-caption">Các lớp và môn được phân công, số tiết theo cơ cấu của từng ban</p>
        </div>
        <span className="td-count-chip">{assignments.length} phân công</span>
      </div>

      {assignments.length === 0 ? (
        <div className="td-empty-block">
          <Icon name="assignment" />
          <span>Giáo viên chưa được phân công giảng dạy trong năm học này.</span>
        </div>
      ) : (
        <div className="td-table-scroll">
          <table className="td-table">
            <thead>
              <tr>
                <th>Lớp</th>
                <th>Môn</th>
                <th>Ban</th>
                <th className="td-right">Số tiết/tuần</th>
                <th>Thời gian</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.assignmentId} className={a.isActive ? undefined : 'td-row--ended'}>
                  <td>
                    <span className={`td-class-chip${a.isHomeroomClass ? ' td-class-chip--ink' : ''}`}>
                      {a.className}
                    </span>
                  </td>
                  <td>{a.subjectName}</td>
                  <td className="td-muted">{a.trackName}</td>
                  <td className="td-right td-num">
                    {a.periodsPerWeek != null ? a.periodsPerWeek : <span className="td-muted">—</span>}
                  </td>
                  <td className="td-num td-muted">
                    {formatDate(a.startDate)} – {formatDate(a.endDate)}
                  </td>
                  <td>
                    <span className="td-notes">
                      {a.isHomeroomClass && (
                        <span className="td-tag td-tag--amber">
                          <Icon name="flag" size="sm" /> Lớp chủ nhiệm
                        </span>
                      )}
                      {!a.isActive && <span className="td-tag">Không còn hiệu lực</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Tổng tiết đang phân công</td>
                <td className="td-right td-num td-total">{workload.periodsPerWeek}</td>
                <td colSpan={2} className="td-muted">Chỉ tính phân công còn hiệu lực hôm nay</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Weekly teaching schedule ────────────────────────────────────────────────
function ScheduleCard({ schedule, loading, onChangeWeek }) {
  const weekStart = schedule.weekStart;
  const today = todayIso();
  const days = weekStart ? DAY_LABELS.map((label, i) => ({ label, date: addDays(weekStart, i), dow: i + 1 })) : [];
  const isCurrentWeek = weekStart && today >= weekStart && today <= addDays(weekStart, 6);

  return (
    <section className="td-card">
      <div className="td-card-head td-schedule-head">
        <div>
          <h2 className="title-sm">Lịch giảng dạy trong tuần</h2>
          <p className="td-caption">
            {weekStart
              ? `Từ ${formatDate(weekStart)} đến ${formatDate(schedule.weekEnd)}`
              : 'Lấy từ thời khoá biểu đã xếp'}
          </p>
        </div>
        {weekStart && (
          <div className="td-week-nav">
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Tuần trước"
              onClick={() => onChangeWeek(addDays(weekStart, -7))}
            >
              <Icon name="chevron_left" />
            </button>
            <button
              type="button"
              className="btn btn-tertiary"
              disabled={isCurrentWeek}
              onClick={() => onChangeWeek(null)}
            >
              Tuần này
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Tuần sau"
              onClick={() => onChangeWeek(addDays(weekStart, 7))}
            >
              <Icon name="chevron_right" />
            </button>
          </div>
        )}
      </div>

      <div className={`td-week${loading ? ' td-week--loading' : ''}`}>
        {days.map((d) => {
          const slots = schedule.slots.filter((s) => s.date === d.date);
          return (
            <div key={d.date} className={`td-day${d.date === today ? ' td-day--today' : ''}`}>
              <div className="td-day-head">
                <span>{d.label}</span>
                <span className="td-day-date">{shortDate(d.date)}</span>
              </div>
              <div className="td-day-body">
                {slots.length === 0 ? (
                  <div className="td-slot td-slot--empty">Không có tiết</div>
                ) : (
                  slots.map((s) => (
                    <div key={`${s.date}-${s.period}`} className="td-slot">
                      <div className="td-slot-time">
                        Tiết {s.period} · {s.startTime}
                      </div>
                      <div className="td-slot-class">{s.className}</div>
                      <div className="td-slot-sub">
                        {s.subjectName}
                        {s.room ? ` · ${s.room}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="td-schedule-foot">
        <Icon name="schedule" size="sm" />
        {schedule.slots.length
          ? `${schedule.slots.length} tiết trong tuần`
          : 'Chưa có tiết nào được xếp trong tuần này'}
      </div>
    </section>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="td-skeleton-wrap" aria-busy="true" aria-label="Đang tải hồ sơ giáo viên">
      <div className="td-card td-skeleton" style={{ height: 128 }} />
      <div className="td-grid">
        <div className="td-col">
          <div className="td-card td-skeleton" style={{ height: 320 }} />
          <div className="td-card td-skeleton" style={{ height: 140 }} />
        </div>
        <div className="td-col">
          <div className="td-card td-skeleton" style={{ height: 240 }} />
          <div className="td-card td-skeleton" style={{ height: 260 }} />
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
// SCR-14 Teacher Detail (UC-16): profile, teaching assignments and weekly schedule. School Manager only.
export default function TeacherDetailPage() {
  const { teacherId } = useParams();
  const { data, loading, scheduleLoading, error, changeWeek } = useTeacherDetail(teacherId);
  const teacher = data?.teacher;

  return (
    <div className="td-page">
      <div className="td-topbar">
        <nav className="td-breadcrumb" aria-label="Breadcrumb">
          <span>EduConnect</span>
          <span className="td-sep">/</span>
          <span>Hồ sơ</span>
          <span className="td-sep">/</span>
          <Link to="/teachers">Giáo viên</Link>
          <span className="td-sep">/</span>
          <strong>{teacher?.fullName ?? '…'}</strong>
        </nav>
        <span className="stamp-badge">SCR-14</span>
      </div>

      {loading && !data && <Skeleton />}

      {error && !data && (
        <div className="td-card td-error">
          <Icon name="error_outline" />
          <div>
            <p>{error}</p>
            <Link to="/teachers" className="btn btn-secondary">
              <Icon name="arrow_back" size="sm" /> Về danh sách giáo viên
            </Link>
          </div>
        </div>
      )}

      {error && data && (
        <div className="notice amber">
          <Icon name="error_outline" />
          <div>{error}</div>
        </div>
      )}

      {data && (
        <>
          <HeaderCard teacher={teacher} schoolYear={data.schoolYear} />

          {teacher.status === 'LOCKED' && (
            <LockedNotice
              teacherId={teacher.teacherId}
              hasHomeroom={teacher.homeroomClasses.length > 0}
              hasTeaching={data.assignments.some((a) => a.isActive)}
            />
          )}

          <div className="td-grid">
            <div className="td-col">
              <PersonalCard teacher={teacher} />
              <WorkloadCard workload={data.workload} assignments={data.assignments} />
            </div>
            <div className="td-col">
              <AssignmentsCard assignments={data.assignments} schoolYear={data.schoolYear} workload={data.workload} />
              <ScheduleCard schedule={data.schedule} loading={scheduleLoading} onChangeWeek={changeWeek} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
