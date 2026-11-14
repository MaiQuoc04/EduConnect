import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getBook, listGradeBooks, unlockBook } from '../../api/grades.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import Dialog from '../admin/Dialog.jsx';
import '../admin/admin.css';
import ExportButton from './ExportButton.jsx';
import GradeBookTable from './GradeBookTable.jsx';
import { BOOK_STATUS, fmtScore, formatDateTime, yearAverage } from './gradeFormat.js';
import SemesterSelect from './SemesterSelect.jsx';
import useGradeOptions from './useGradeOptions.js';
import './grades.css';

// SCR-68 Grade Control (School Manager) – every grade book of a semester with its status; UC-86 Unlock Grades;
// read-only view of a book; link to UC-87 View Grade Change History.

export default function GradeControlPage() {
  const toast = useToast();
  const options = useGradeOptions();
  const [params, setParams] = useSearchParams();
  const semesterId = params.get('semesterId') ?? '';
  const status = params.get('status') ?? '';
  const classFilter = params.get('classId') ?? '';
  const [state, setState] = useState({ loading: false, data: null, error: '' });
  const [unlocking, setUnlocking] = useState(null);
  const [viewing, setViewing] = useState(null);

  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (options.data && !semesterId) update({ semesterId: String(options.data.currentSemesterId ?? options.semesters[0]?.semesterId ?? '') });
  }, [options.data, options.semesters, semesterId, update]);

  const load = useCallback(() => {
    if (!semesterId) return;
    setState((s) => ({ ...s, loading: true, error: '' }));
    listGradeBooks({ semesterId, status: status || undefined })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((err) => setState({ loading: false, data: null, error: errorText(err) }));
  }, [semesterId, status]);
  useEffect(load, [load]);

  const items = state.data?.items ?? [];
  // The semesters of the chosen semester's school year (for the book view tabs).
  const chosen = options.semesters.find((s) => String(s.semesterId) === semesterId);
  const yearSemesters = useMemo(
    () => options.semesters.filter((s) => s.schoolYearId === chosen?.schoolYearId).sort((a, b) => a.semesterNo - b.semesterNo),
    [options.semesters, chosen?.schoolYearId],
  );
  const classes = [...new Map(items.map((b) => [String(b.classId), b.className])).entries()];
  const shown = classFilter ? items.filter((b) => String(b.classId) === classFilter) : items;
  const counts = items.reduce((acc, b) => ({ ...acc, [b.status]: (acc[b.status] ?? 0) + 1 }), {});

  return (
    <div className="grade-wide">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Học tập</span>/<span className="current">Quản lý sổ điểm</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Quản lý sổ điểm</h1>
          <p>Trạng thái sổ điểm từng lớp – môn. Mở khoá sổ đã chốt khi giáo viên cần sửa điểm, xem lịch sử sửa điểm.</p>
        </div>
        <Link className="btn btn-secondary" to={`/grades/history${semesterId ? `?semesterId=${semesterId}` : ''}`}>
          <Icon name="history" size="sm" /> Lịch sử sửa điểm
        </Link>
      </div>

      <div className="grade-toolbar">
        <SemesterSelect semesters={options.semesters} value={semesterId} onChange={(v) => update({ semesterId: v, classId: '' })} />
        <label className="field" htmlFor="ctl-class">
          <span className="field-label">Lớp</span>
          <select id="ctl-class" className="input" value={classFilter} onChange={(e) => update({ classId: e.target.value })}>
            <option value="">Tất cả lớp</option>
            {classes.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="ctl-status">
          <span className="field-label">Trạng thái</span>
          <select id="ctl-status" className="input" value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Tất cả</option>
            {Object.entries(BOOK_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {!status && items.length > 0 && (
          <span className="caption muted actions">
            {items.length} sổ · {counts.LOCKED ?? 0} đã chốt · {counts.UNLOCKED ?? 0} đã mở khoá · {counts.OPEN ?? 0} chưa chốt
          </span>
        )}
      </div>

      {(options.error || state.error) && <p className="form-error">{options.error || state.error}</p>}

      <section className="card card-outline" style={{ padding: 0 }}>
        <div className="table-scroll" style={{ border: 0 }}>
          <table className={`table${state.loading ? ' is-loading' : ''}`}>
            <thead>
              <tr>
                <th>Lớp</th>
                <th>Môn</th>
                <th>Giáo viên</th>
                <th>Trạng thái</th>
                <th>Chốt / mở khoá</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const st = BOOK_STATUS[b.status];
                return (
                  <tr key={`${b.classId}:${b.subjectId}`}>
                    <td>{b.className}</td>
                    <td>
                      {b.subjectName}
                      {!b.hasStructure && <div className="caption muted">Chưa có cấu trúc điểm</div>}
                    </td>
                    <td className={b.teachers ? '' : 'muted'}>{b.teachers ?? 'Chưa phân công'}</td>
                    <td>
                      <span className={`gtag ${st.tone}`}>{st.label}</span>
                    </td>
                    <td className="caption muted">
                      {b.status === 'LOCKED' && `${formatDateTime(b.lockedAt)} · ${b.lockedBy}`}
                      {b.status === 'UNLOCKED' && `${formatDateTime(b.unlockedAt)} · ${b.unlockedBy}`}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" className="btn btn-tertiary" onClick={() => setViewing(b)} disabled={!b.hasStructure}>
                        Xem sổ
                      </button>
                      {b.status === 'LOCKED' && (
                        <button type="button" className="btn btn-secondary" onClick={() => setUnlocking(b)}>
                          <Icon name="lock_open" size="sm" /> Mở khoá
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {state.data && !shown.length && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', height: 72 }}>
                    Không có sổ điểm nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {unlocking && (
        <UnlockDialog
          book={unlocking}
          semesterId={semesterId}
          onClose={() => setUnlocking(null)}
          onDone={() => {
            setUnlocking(null);
            toast('Đã mở khoá sổ điểm. Giáo viên có thể sửa điểm và chốt lại.');
            load();
          }}
        />
      )}
      {viewing && (
        <BookViewDialog
          book={viewing}
          semesterId={semesterId}
          semesters={yearSemesters}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

// UC-86: confirm with an optional reason (kept in the activity log).
function UnlockDialog({ book, semesterId, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try {
      await unlockBook(book.classId, book.subjectId, semesterId, reason);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Mở khoá sổ điểm"
      icon="lock_open"
      tone="red"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
            {busy ? 'Đang mở khoá…' : 'Mở khoá'}
          </button>
        </>
      }
    >
      <p>
        Mở khoá sổ điểm <strong>{book.subjectName}</strong> lớp <strong>{book.className}</strong>? Giáo viên sẽ sửa được
        điểm và phải chốt lại. Mọi thay đổi đều được ghi vào lịch sử sửa điểm.
      </p>
      <label className="field" htmlFor="unlock-reason">
        <span className="field-label">
          Lý do <span className="caption muted">không bắt buộc</span>
        </span>
        <textarea
          id="unlock-reason"
          className="input textarea"
          value={reason}
          maxLength={255}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ví dụ: sửa điểm cuối kỳ sau phúc khảo"
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="error" size="sm" />
          {error}
        </p>
      )}
    </Dialog>
  );
}

// Read-only view of one class × subject for the whole school year: tabs Học kỳ 1 | Học kỳ 2 | Cả năm (FE-11 owner,
// 14/11/2026). The tab of the semester chosen in the filter opens first. "Cả năm" = per student the two semester
// averages and the year average (HK1 + 2 × HK2) / 3, rounded like the server (Circular 22).
function BookViewDialog({ book, semesterId, semesters, onClose }) {
  const [tab, setTab] = useState(String(semesterId));
  const [books, setBooks] = useState({}); // semesterId -> { data, error }
  useEffect(() => {
    let alive = true;
    for (const se of semesters) {
      getBook(book.classId, book.subjectId, se.semesterId)
        .then((data) => alive && setBooks((b) => ({ ...b, [se.semesterId]: { data, error: '' } })))
        .catch((err) => alive && setBooks((b) => ({ ...b, [se.semesterId]: { data: null, error: errorText(err) } })));
    }
    return () => {
      alive = false;
    };
  }, [book, semesters]);

  const current = tab === 'YEAR' ? null : books[tab];
  const historySemester = tab === 'YEAR' ? semesterId : tab;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Sổ điểm" style={{ width: 'min(1100px, 100%)' }}>
        <div className="dialog-head">
          <h2 className="title-md">
            Sổ điểm {book.subjectName} · Lớp {book.className}
          </h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog-body">
          <div className="pill-tabs book-tabs" role="tablist">
            {[...semesters.map((se) => [String(se.semesterId), `Học kỳ ${se.semesterNo}`]), ['YEAR', 'Cả năm']].map(([value, label]) => {
              const st = value !== 'YEAR' && books[value]?.data ? BOOK_STATUS[books[value].data.lock.status ?? 'OPEN'] : null;
              return (
                <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
                  {label}
                  {st && <span className={`gtag ${st.tone}`}>{st.label}</span>}
                </button>
              );
            })}
          </div>
          {tab === 'YEAR' ? (
            <YearTable semesters={semesters} books={books} />
          ) : (
            <>
              {current?.error && <p className="form-error">{current.error}</p>}
              {!current && <p className="muted">Đang tải…</p>}
              {current?.data && !current.data.components.length && <p className="muted">Học kỳ này chưa có cấu trúc điểm.</p>}
              {current?.data?.components.length > 0 && <GradeBookTable book={current.data} editable={false} />}
            </>
          )}
        </div>
        <div className="dialog-footer">
          {tab !== 'YEAR' && (
            <ExportButton classId={book.classId} subjectId={book.subjectId} semesterId={tab} disabled={!current?.data?.components.length} />
          )}
          <Link className="btn btn-secondary" to={`/grades/history?semesterId=${historySemester}&classId=${book.classId}&subjectId=${book.subjectId}`}>
            <Icon name="history" size="sm" /> Lịch sử sửa điểm
          </Link>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// "Cả năm": one row per student of the class with each semester average and the year average.
function YearTable({ semesters, books }) {
  const loaded = semesters.every((se) => books[se.semesterId]);
  if (!loaded) return <p className="muted">Đang tải…</p>;
  const [s1, s2] = semesters.map((se) => books[se.semesterId]?.data ?? null);
  const students = (s1 ?? s2)?.students ?? [];
  const averageOf = (bk, enrollmentId) => bk?.students.find((x) => String(x.enrollmentId) === String(enrollmentId))?.average ?? null;
  return (
    <div className="table-scroll">
        <table className="table report-table">
          <thead>
            <tr>
              <th>Học sinh</th>
              {semesters.map((se) => (
                <th key={se.semesterId}>ĐTB HK{se.semesterNo}</th>
              ))}
              <th>ĐTB cả năm</th>
            </tr>
          </thead>
          <tbody>
            {students.map((st) => {
              const a1 = averageOf(s1, st.enrollmentId);
              const a2 = averageOf(s2, st.enrollmentId);
              const year = semesters.length === 2 ? yearAverage(a1, a2) : null;
              return (
                <tr key={st.enrollmentId} className={st.status !== 'STUDYING' ? 'muted' : undefined}>
                  <td>
                    {st.fullName}
                    <div className="caption muted mono">
                      {st.studentCode}
                      {st.status !== 'STUDYING' && ' · đã rời lớp'}
                    </div>
                  </td>
                  <td>{fmtScore(a1) || <span className="muted">–</span>}</td>
                  {semesters.length === 2 && <td>{fmtScore(a2) || <span className="muted">–</span>}</td>}
                  <td>
                    <strong>{fmtScore(year) || <span className="muted">–</span>}</strong>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
    </div>
  );
}
