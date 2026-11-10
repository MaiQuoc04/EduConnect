import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { downloadTimetableTemplate, importTimetables, previewTimetableImport } from '../../api/timetables.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { clashWhen, dm, dmy, groupClashes } from './WeekTimetable.jsx';
import './timetable.css';

// UC-72 Import Class Timetable (FE-10, School Manager) – dialog opened from Timetable Management (Stitch SCR-39):
// 1. Tải tệp → 2. Xem trước & kiểm tra (saves nothing) → 3. Kết quả. One file = the weekly pattern of one or more
// classes; "Nhập" saves every class of the file, or none when anything is wrong.

const ROW_TEXT = {
  TT_ROW_REQUIRED: () => 'Thiếu thông tin bắt buộc',
  TT_ROW_CLASS_NOT_FOUND: (i) => `Không có lớp “${i.value}” trong năm học này`,
  TT_ROW_WEEKDAY: (i) => `Thứ “${i.value}” không hợp lệ (ghi 2 đến 7)`,
  TT_ROW_PERIOD: (i) => `Tiết “${i.value}” không có trong bảng giờ học`,
  TT_ROW_SUBJECT: (i) => `Môn “${i.value}” không thuộc loại lớp của ${i.className}`,
  TT_ROW_ROOM: () => 'Tên phòng tối đa 50 ký tự',
  TT_ROW_DUPLICATE: (i) => `Trùng thứ và tiết với dòng ${i.otherRow}`,
};

// Rows of the check table: file rows with errors, class conflicts, then the valid classes.
function checkRows(result) {
  const out = [];
  for (const p of result.problems) {
    out.push({
      key: `r${p.row}`, className: p.values.className || '—',
      when: p.values.weekday || p.values.period ? `Thứ ${p.values.weekday || '?'} · Tiết ${p.values.period || '?'}` : '—',
      subject: p.values.subject || '—', notes: p.issues.map((i) => (ROW_TEXT[i.code] ?? (() => i.code))(i)), label: `Lỗi dòng ${p.row}`,
    });
  }
  for (const c of result.classes.filter((x) => !x.ok)) {
    const items = c.error?.details?.items ?? [];
    if (c.error?.code === 'MSG_TIMETABLE_TEACHER_CLASH') {
      groupClashes(items).forEach((p, i) => out.push({
        key: `c${c.classId}-${i}`, className: c.className, when: clashWhen(p),
        subject: '—', teacher: p.teacher, notes: [`Trùng lịch: ${p.teacher} đang dạy ${p.otherClass} tiết này`], label: 'Lỗi trùng',
      }));
    } else if (c.error?.code === 'MSG_TIMETABLE_NO_TEACHER') {
      items.forEach((p, i) => out.push({
        key: `c${c.classId}-${i}`, className: c.className, when: `${dm(p.from)} – ${dm(p.to)}`, subject: p.subject, subjectBad: true,
        notes: [`Môn chưa có phân công giáo viên giảng dạy (${p.periods} tiết)`], label: 'Thiếu GV',
      }));
    } else {
      out.push({ key: `c${c.classId}`, className: c.className, when: '—', subject: '—', notes: [errorText(c.error ?? {})], label: 'Lỗi' });
    }
  }
  for (const c of result.classes.filter((x) => x.ok)) {
    out.push({ key: `ok${c.classId}`, className: c.className, when: `${c.periodsPerWeek} tiết/tuần`, subject: '—', ok: true, generated: c.generated });
  }
  return out;
}

export function ImportDialog({ open, onClose, onDone, years, today, initialYearId }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [step, setStep] = useState(1);
  const [yearId, setYearId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pickYear = (id) => {
    const y = years.find((x) => String(x.id) === String(id));
    setYearId(id ? String(id) : '');
    if (y) { setStart(today > y.startDate ? today : y.startDate); setEnd(y.endDate); }
  };
  useEffect(() => {
    if (!open) return;
    setStep(1); setFile(null); setResult(null); setDone(null); setError('');
    pickYear(initialYearId ?? years[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);
  if (!open) return null;

  const year = years.find((y) => String(y.id) === yearId);
  const min = year ? (today > year.startDate ? today : year.startDate) : '';
  const input = { schoolYearId: yearId, startDate: start, endDate: end, file };
  const rangeError = !year ? 'Chưa có năm học nào còn đang diễn ra.' : !start ? 'Chọn ngày bắt đầu áp dụng.'
    : start < min ? `Ngày bắt đầu phải từ ${dmy(min)} trở đi.` : end && end < start ? 'Ngày kết thúc phải sau ngày bắt đầu.'
      : (end || start) > year.endDate ? `Thời gian phải nằm trong năm học (đến ${dmy(year.endDate)}).` : '';
  // Size limit: server setting upload.max_file_mb (MSG_UPLOAD_FAILED).
  const fileError = file && !/\.xlsx$/i.test(file.name) ? 'Chỉ nhận tệp Excel .xlsx (tải tệp mẫu ở bên dưới).' : '';

  async function check() {
    setBusy(true); setError('');
    try {
      setResult(await previewTimetableImport(input));
      setStep(2);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true); setError('');
    try {
      const r = await importTimetables(input);
      setDone(r); setStep(3);
      toast(`Đã nhập thời khoá biểu cho ${r.classes.length} lớp.`);
      onDone?.();
    } catch (err) {
      if (err.code === 'MSG_TIMETABLE_IMPORT_HAS_ERRORS' && err.details) setResult(err.details);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function template() {
    try {
      await downloadTimetableTemplate(yearId);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    }
  }

  const rows = result ? checkRows(result) : [];
  const errorCount = rows.filter((r) => !r.ok).length;
  const steps = ['Tải tệp', 'Xem trước & kiểm tra', 'Kết quả'];

  return (
    <div className="tt-overlay" onClick={() => !busy && onClose()}>
      <div className="tt-dialog tt-import" role="dialog" aria-modal="true" aria-labelledby="tt-import-title" onClick={(e) => e.stopPropagation()}>
        <header className="tt-dialog-head">
          <div>
            <span className="label-upper tt-ink">Nhập dữ liệu</span>
            <h2 id="tt-import-title" className="tt-dialog-title">Nhập thời khoá biểu từ tệp Excel</h2>
          </div>
          <button type="button" className="tt-navbtn is-plain" onClick={onClose} disabled={busy} aria-label="Đóng"><Icon name="close" size="sm" /></button>
        </header>
        <ol className="tt-stepper">
          {steps.map((s, i) => (
            <li key={s} className={step === i + 1 ? 'is-on' : step > i + 1 ? 'is-done' : ''}>
              <span>{step > i + 1 ? '✓' : i + 1}</span>{i + 1}. {s}
            </li>
          ))}
        </ol>

        <div className="tt-dialog-body">
          {step === 1 && (
            <>
              <div className="tt-import-row">
                <div className="field">
                  <label className="field-label" htmlFor="ti-year">Năm học</label>
                  <select id="ti-year" className="input" value={yearId} onChange={(e) => pickYear(e.target.value)}>
                    {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="ti-start">Áp dụng từ ngày</label>
                  <input id="ti-start" type="date" className="input" value={start} min={min} max={year?.endDate} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="ti-end">Đến ngày</label>
                  <input id="ti-end" type="date" className="input" value={end} min={start || min} max={year?.endDate} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              {rangeError && <p className="field-error" role="alert">{rangeError}</p>}
              <p className="caption tt-muted">Các lớp trong tệp dùng thời khoá biểu mới từ {dmy(start)} đến {dmy(end)}; trước đó giữ nguyên, tiết đã điểm danh không đổi.</p>
              <div className="tt-drop">
                <Icon name="upload_file" />
                <div>
                  <p className="tt-detail-strong">{file ? file.name : 'Chưa chọn tệp'}</p>
                  <p className="caption tt-muted">Mỗi dòng là một tiết: Lớp, Thứ (2–7), Tiết, Môn (mã hoặc tên), Phòng. Một tệp có thể gồm nhiều lớp.</p>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); e.target.value = ''; }} />
                <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Icon name="attach_file" size="sm" /> Chọn tệp .xlsx</button>
              </div>
              {fileError && <p className="field-error" role="alert">{fileError}</p>}
              <button type="button" className="tt-link" onClick={template} disabled={!yearId}><Icon name="download" size="sm" /> Tải tệp mẫu (kèm giờ các tiết và môn của từng lớp)</button>
            </>
          )}

          {step === 2 && result && (
            <>
              <div className={`tt-summary ${result.ok ? 'is-ok' : 'is-bad'}`}>
                <Icon name={result.ok ? 'check_circle' : 'error'} />
                <div>
                  <strong>{result.ok ? 'Tệp hợp lệ, có thể nhập' : `Phát hiện ${errorCount} lỗi cần xử lý`}</strong>
                  <span>Tệp <b>{file?.name}</b> có {result.rows} dòng ({result.validRows} dòng hợp lệ) cho {result.classes.length} lớp.{result.ok ? '' : ' Sửa tệp theo ghi chú mực đỏ rồi kiểm tra lại.'}</span>
                </div>
              </div>
              <div className="tt-check-wrap">
                <table className="tt-check">
                  <thead><tr><th>Lớp</th><th>Thời gian</th><th>Môn học</th><th>Ghi chú</th><th className="is-right">Kiểm tra</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td className="tt-check-class">{r.className}</td>
                        <td>{r.when}</td>
                        <td><span className={r.subjectBad ? 'tt-wavy' : ''}>{r.subject}</span></td>
                        <td>
                          {r.ok ? <span className="tt-muted">{r.generated} tiết sẽ được tạo</span> : (
                            <>
                              {r.teacher && <span className="tt-wavy">{r.teacher}</span>}
                              {r.notes.map((n, i) => <span key={i} className="tt-pen-note"><Icon name="edit" size="sm" />{n}</span>)}
                            </>
                          )}
                        </td>
                        <td className="is-right">
                          {r.ok ? <span className="tt-ok"><Icon name="check_circle" size="sm" />Hợp lệ</span> : <span className="tt-bad">{r.label}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="caption tt-muted">Khi bấm nhập, tất cả các lớp trong tệp được lưu cùng lúc; còn lỗi thì không lớp nào được lưu.</p>
            </>
          )}

          {step === 3 && done && (
            <div className="tt-summary is-ok">
              <Icon name="check_circle" />
              <div>
                <strong>Đã nhập thời khoá biểu cho {done.classes.length} lớp</strong>
                <span>{done.classes.map((c) => `${c.className}: ${c.generated} tiết`).join(' · ')}. Áp dụng từ {dmy(done.startDate)} đến {dmy(done.endDate)}.</span>
              </div>
            </div>
          )}
          {error && <p className="field-error" role="alert">{error}</p>}
        </div>

        <footer className="tt-dialog-foot">
          {step < 3 ? <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Huỷ</button> : <span />}
          <div className="tt-dialog-actions">
            {step === 1 && (
              <button type="button" className="btn btn-primary" disabled={!file || !!rangeError || !!fileError || busy} onClick={check}>
                {busy ? 'Đang kiểm tra…' : 'Kiểm tra tệp'} <Icon name="arrow_forward" size="sm" />
              </button>
            )}
            {step === 2 && (
              <>
                <button type="button" className="btn btn-secondary" onClick={() => { setStep(1); setError(''); }} disabled={busy}><Icon name="arrow_back" size="sm" /> Quay lại</button>
                <button type="button" className="btn btn-primary" disabled={!result?.ok || busy} onClick={run}
                  title={result?.ok ? undefined : 'Vui lòng sửa lỗi trong tệp trước khi nhập'}>
                  {busy ? 'Đang nhập…' : result?.ok ? `Nhập thời khoá biểu ${result.classes.length} lớp` : `Tiếp tục nhập dữ liệu (còn ${errorCount} lỗi)`}
                  <Icon name="arrow_forward" size="sm" />
                </button>
              </>
            )}
            {step === 3 && <button type="button" className="btn btn-primary" onClick={onClose}>Xong</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}

// Old address /timetables/import → the management screen with the dialog open.
export default function TimetableImportPage() {
  const [params] = useSearchParams();
  const y = params.get('schoolYearId');
  return <Navigate to={`/timetables?import=1${y ? `&schoolYearId=${y}` : ''}`} replace />;
}
