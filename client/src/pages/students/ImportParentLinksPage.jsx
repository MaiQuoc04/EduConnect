import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadParentLinkTemplate, importParentLinks, previewParentLinks } from '../../api/students.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, RELATIONSHIP_LABELS } from '../../messages.js';
// Same wizard, summary and preview table classes as FE-13's Import Accounts (UC-96), so the two import screens
// look and work the same for the school staff (business-rules §4: UC-14 "works like the account import").
import '../admin/admin.css';
import './ImportParentLinksPage.css';

// SCR-07 "Nhập liên kết phụ huynh" – UC-14 Import Parent–Student Links (FE-02), School Manager only.
// Same steps as UC-96 (ImportAccountsPage.jsx): choose the file → check the preview → import the valid rows.
// The chosen File is kept in memory and sent again, unchanged, to the import: the server checks the file again from
// the start and keeps nothing between the two calls. Differences from UC-96, on purpose:
//   - the preview starts as soon as a file is chosen (the "Kiểm tra file" button stays for a retry);
//   - a confirmation dialog before saving, because a link lets the parent see the child's grades and attendance;
//   - the student's and the parent's names are shown so a wrong phone number is noticed before saving.

const ACCEPT = '.xlsx,.csv';
const MAX_ROWS = 500; // business-rules §4

// TODO messages.js: row error codes of UC-14 waiting for the team lead's approval (then use errorText()).
const ROW_ERRORS = {
  MSG_REQUIRED: () => 'Thiếu giá trị bắt buộc.',
  MSG_STUDENT_NOT_FOUND: () => 'Không tìm thấy học sinh với mã này.',
  MSG_PARENT_PHONE_NOT_FOUND: () => 'Không có tài khoản phụ huynh nào với số điện thoại này.',
  MSG_INVALID_RELATIONSHIP_TYPE: () => 'Quan hệ phải là Bố, Mẹ hoặc Người giám hộ.',
  MSG_LINK_ALREADY_EXISTS: () => 'Phụ huynh này đã được liên kết với học sinh.',
  MSG_MAX_PARENTS_REACHED: (d) => `Mỗi học sinh có tối đa ${d?.max ?? 2} phụ huynh.`,
  MSG_DUPLICATE_LINK_IN_FILE: (d) =>
    d?.duplicateOf ? `Học sinh và phụ huynh này đã có ở dòng ${d.duplicateOf} trong file.` : 'Học sinh và phụ huynh này đã có ở một dòng phía trên trong file.',
};
const ROW_ERROR_FALLBACK = 'Dòng này không hợp lệ.';
// TODO messages.js: WARN_* codes are waiting for approval too (same texts as SCR-13).
const WARNINGS = {
  WARN_STUDENT_HAS_NO_CLASS: 'Một học sinh chưa thuộc lớp nào nên phụ huynh chưa được thêm vào nhóm lớp.',
  WARN_CLASS_HAS_NO_GROUPS: (d) => `Lớp ${d?.className ?? ''} chưa có nhóm lớp, phụ huynh chưa được thêm vào nhóm nào.`,
  WARN_CLASS_GROUPS_MISSING: (d) => `Lớp ${d?.className ?? ''} còn thiếu một số nhóm lớp, phụ huynh chưa được thêm vào các nhóm đó.`,
};
const FILE_ERROR_FALLBACK = 'Không kiểm tra được file. Vui lòng thử lại.';

const fileSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const number = (n) => n.toLocaleString('vi-VN');

function rowErrorText(row) {
  const text = ROW_ERRORS[row.errorCode];
  if (text) return text(row.details);
  console.warn(`[ImportParentLinks] No Vietnamese message for row error ${row.errorCode}:`, row.errorMessage);
  return ROW_ERROR_FALLBACK;
}

// File-level errors (MSG_IMPORT_*) already have their Vietnamese text in messages.js (FE-13 uses them).
function fileErrorText(err) {
  const text = errorText(err);
  if (err.code !== 'NETWORK_ERROR' && text === err.message) {
    console.warn(`[ImportParentLinks] No Vietnamese message for error code ${err.code}:`, err.message);
    return FILE_ERROR_FALLBACK;
  }
  return text;
}

function warningText(w) {
  const entry = WARNINGS[w.code];
  if (typeof entry === 'function') return entry(w.details);
  if (entry) return entry;
  console.warn(`[ImportParentLinks] No Vietnamese message for warning ${w.code}:`, w.message);
  return 'Một số nhóm lớp chưa được cập nhật.';
}

function FormError({ text }) {
  if (!text) return null;
  return (
    <p className="form-error" role="alert">
      <Icon name="error" size="sm" />
      {text}
    </p>
  );
}

// Step 1: template and file (UC-96 layout without the account type).
function UploadStep({ file, busy, error, onPick, onCheck }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function pick(chosen) {
    if (!chosen || busy) return;
    if (!/\.(xlsx|csv)$/i.test(chosen.name)) {
      toast('Chỉ chấp nhận file .xlsx hoặc .csv.', { type: 'error' });
      return;
    }
    onPick(chosen);
  }

  async function template() {
    try {
      await downloadParentLinkTemplate();
    } catch (err) {
      toast(fileErrorText(err), { type: 'error' });
    }
  }

  return (
    <section className="card card-outline admin-form import-parent-links-upload">
      <h2 className="card-title title-sm">
        <span className="step-no">1</span>
        Điền file mẫu
      </h2>
      <div className="actions-row">
        <button type="button" className="btn btn-secondary" onClick={template}>
          <Icon name="download" size="sm" />
          Tải file mẫu
        </button>
        <span className="caption muted">
          Ba cột: Mã học sinh, Số điện thoại phụ huynh, Quan hệ (Bố, Mẹ hoặc Người giám hộ). Tối đa {MAX_ROWS} dòng.
        </span>
      </div>
      <p className="caption muted import-parent-links-hint">
        Số điện thoại là số của tài khoản phụ huynh đã có trong hệ thống; file này không tạo tài khoản mới. Mỗi học sinh có
        tối đa 2 phụ huynh, tính cả các liên kết đã có.
      </p>

      <div className="section-sep" />
      <h2 className="card-title title-sm">
        <span className="step-no">2</span>
        Chọn file đã điền
      </h2>
      <div
        className={`dropzone${dragging ? ' dragging' : ''}${busy ? ' is-busy' : ''}`}
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        aria-describedby="import-parent-links-drop-help"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <span className="upload-icon">
          <Icon name={busy ? 'progress_activity' : file ? 'description' : 'upload_file'} className={busy ? 'import-parent-links-spin' : undefined} />
        </span>
        {busy ? (
          <p>Đang kiểm tra {file?.name}…</p>
        ) : file ? (
          <>
            <p className="import-parent-links-file">{file.name}</p>
            <p className="caption muted" id="import-parent-links-drop-help">
              {fileSize(file.size)} · <span className="import-parent-links-link">chọn file khác</span>
            </p>
          </>
        ) : (
          <>
            <p>
              Kéo file vào đây hoặc <span className="import-parent-links-link ink">chọn file</span>
            </p>
            <p className="caption muted" id="import-parent-links-drop-help">
              Định dạng .xlsx hoặc .csv (UTF-8), tối đa {MAX_ROWS} dòng. Hệ thống kiểm tra ngay sau khi chọn.
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="import-parent-links-error">
          <FormError text={error} />
        </div>
      )}

      <div className="section-sep" />
      <div className="card-footer">
        <Link to="/students" className="btn btn-secondary">
          Huỷ
        </Link>
        <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={onCheck}>
          <Icon name="fact_check" size="sm" />
          {busy ? 'Đang kiểm tra…' : 'Kiểm tra file'}
        </button>
      </div>
    </section>
  );
}

const STATUS = {
  VALID: { label: 'Hợp lệ', className: 'pill green' },
  INVALID: { label: 'Có lỗi', className: 'pill import-parent-links-pill-warn' },
  IMPORTED: { label: 'Đã lưu', className: 'pill import-parent-links-pill-saved' },
};

function Summary({ fileName, summary, done }) {
  return (
    <div className="import-summary">
      <div>
        <span className="label-upper">File</span>
        <p className="summary-file">{fileName}</p>
        <p className="caption muted">Liên kết phụ huynh – học sinh</p>
      </div>
      <div className="stat">
        <span className="label-upper">Tổng số dòng</span>
        <strong>{number(summary.total)}</strong>
      </div>
      <div className="stat ok">
        <span className="label-upper">{done ? 'Đã lưu' : 'Hợp lệ'}</span>
        <strong>{number(done ? summary.imported : summary.valid)}</strong>
      </div>
      <div className={`stat${summary.invalid ? ' import-parent-links-stat-warn' : ''}`}>
        <span className="label-upper">{done ? 'Bỏ qua' : 'Có lỗi'}</span>
        <strong>{number(summary.invalid)}</strong>
      </div>
    </div>
  );
}

// The preview and the import answer the same shape, so one table shows both (status VALID / INVALID / IMPORTED).
function ResultTable({ rows, onlyErrors }) {
  const shown = onlyErrors ? rows.filter((r) => r.status === 'INVALID') : rows;
  return (
    <div className="table-scroll import-parent-links-scroll" tabIndex={0} aria-label="Kết quả kiểm tra từng dòng">
      <table className="table import-table import-parent-links-table">
        <thead>
          <tr>
            <th className="num">Dòng</th>
            <th>Mã học sinh</th>
            <th className="is-name">Tên học sinh</th>
            <th>Số điện thoại</th>
            <th className="is-name">Tên phụ huynh</th>
            <th>Quan hệ</th>
            <th>Kết quả kiểm tra</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.rowNumber} className={r.status === 'INVALID' ? 'is-invalid' : undefined}>
              <td className="num mono muted">{r.rowNumber}</td>
              <td className="mono">{r.studentCode || <span className="muted">(trống)</span>}</td>
              <td className="is-name">{r.studentName ?? <span className="muted">Không xác định</span>}</td>
              <td className="mono">{r.phone || <span className="muted">(trống)</span>}</td>
              <td className="is-name">{r.parentName ?? <span className="muted">Không xác định</span>}</td>
              <td>{RELATIONSHIP_LABELS[r.relationshipType] ?? (r.relationshipText || <span className="muted">(trống)</span>)}</td>
              <td>
                <span className={STATUS[r.status]?.className ?? 'pill'}>{STATUS[r.status]?.label ?? r.status}</span>
                {r.status === 'INVALID' && <p className="import-parent-links-reason">{rowErrorText(r)}</p>}
              </td>
            </tr>
          ))}
          {!shown.length && (
            <tr>
              <td colSpan={7} className="muted">
                Không có dòng nào có lỗi.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function OnlyErrorsToggle({ checked, onChange, count }) {
  return (
    <label className="check-inline import-parent-links-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={!count && !checked} />
      Chỉ xem các dòng có lỗi ({number(count)})
    </label>
  );
}

// Step 2: preview; nothing is saved yet.
function PreviewStep({ fileName, preview, busy, error, onBack, onImport }) {
  // ASSUMPTION: unlike UC-96 (which opens on the rows with errors), every row is shown first: the names of the
  // valid rows are what the School Manager must read before confirming.
  const [onlyErrors, setOnlyErrors] = useState(false);
  const { summary } = preview;
  return (
    <section className="card card-outline import-parent-links-card">
      <Summary fileName={fileName} summary={summary} />

      {summary.valid === 0 ? (
        <div className="notice amber import-parent-links-notice" role="status">
          <Icon name="warning" />
          <div>
            <p className="notice-title">File không có dòng hợp lệ nào để nhập</p>
            <p>Vui lòng sửa các dòng được đánh dấu trong file rồi chọn lại file.</p>
          </div>
        </div>
      ) : (
        <div className="notice ink import-parent-links-notice">
          <Icon name="visibility" />
          <div>
            <p className="notice-title">Kiểm tra tên học sinh và tên phụ huynh trước khi nhập</p>
            <p>Liên kết cho phép phụ huynh xem thông tin, điểm và điểm danh của học sinh. Một số điện thoại nhập nhầm sẽ cho người khác xem được các thông tin này.</p>
          </div>
        </div>
      )}

      <div className="actions-row import-parent-links-tools">
        <OnlyErrorsToggle checked={onlyErrors} onChange={setOnlyErrors} count={summary.invalid} />
        <span className="caption muted push">Chưa có liên kết nào được lưu.</span>
      </div>

      <ResultTable rows={preview.rows} onlyErrors={onlyErrors} />

      {error && (
        <div className="import-parent-links-error">
          <FormError text={error} />
        </div>
      )}

      <div className="section-sep" />
      <div className="card-footer">
        {summary.invalid > 0 && summary.valid > 0 && (
          <span className="left">
            <Icon name="info" size="sm" />
            {number(summary.invalid)} dòng có lỗi sẽ được bỏ qua.
          </span>
        )}
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
          Chọn file khác
        </button>
        <button type="button" className="btn btn-primary" onClick={onImport} disabled={busy || !summary.valid}>
          <Icon name="link" size="sm" />
          {`Nhập ${number(summary.valid)} liên kết hợp lệ`}
        </button>
      </div>
    </section>
  );
}

// Native <dialog>, as the other FE-02 confirmations (SCR-11, SCR-13).
function ConfirmDialog({ open, summary, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="import-parent-links-dialog"
      aria-labelledby="import-parent-links-dialog-title"
      aria-describedby="import-parent-links-dialog-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="import-parent-links-dialog-head">
        <Icon name="verified_user" />
        <h2 id="import-parent-links-dialog-title" className="title-sm">
          Xác nhận nhập liên kết
        </h2>
      </div>
      <div id="import-parent-links-dialog-desc">
        <p>
          Lưu <span className="strong">{number(summary.valid)} liên kết</span> hợp lệ
          {summary.invalid > 0 ? (
            <>
              ; <span className="strong">{number(summary.invalid)} dòng</span> có lỗi sẽ được bỏ qua.
            </>
          ) : (
            '.'
          )}
        </p>
        <p>Phụ huynh được thêm vào nhóm chung và nhóm phụ huynh của lớp con đang học.</p>
        <div className="notice amber">
          <Icon name="warning" size="sm" />
          <p>
            Sau khi liên kết, phụ huynh xem được thông tin, điểm và điểm danh của học sinh. Hãy chắc chắn tên học sinh và tên
            phụ huynh trên từng dòng là đúng.
          </p>
        </div>
      </div>
      <div className="import-parent-links-dialog-actions">
        {/* The safe button gets the focus: confirming must be a deliberate click. */}
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy} autoFocus>
          Quay lại
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          <Icon name={busy ? 'progress_activity' : 'link'} size="sm" className={busy ? 'import-parent-links-spin' : undefined} />
          {busy ? 'Đang lưu…' : `Lưu ${number(summary.valid)} liên kết`}
        </button>
      </div>
    </dialog>
  );
}

// Step 3: the same table, saved rows marked IMPORTED.
function DoneStep({ fileName, result, onAgain }) {
  const [onlyErrors, setOnlyErrors] = useState(false);
  const { summary, warnings = [] } = result;
  return (
    <section className="card card-outline import-parent-links-card">
      <div className="notice ink import-parent-links-notice">
        <Icon name="check_circle" />
        <div>
          <p className="notice-title">Đã lưu {number(summary.imported)} liên kết phụ huynh – học sinh</p>
          <p>
            {summary.invalid ? `${number(summary.invalid)} dòng có lỗi đã được bỏ qua.` : 'Mọi dòng trong file đều đã được nhập.'}
          </p>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="notice amber import-parent-links-notice">
          <Icon name="warning" />
          <div>
            <p className="notice-title">Một số nhóm lớp chưa được cập nhật</p>
            <ul className="import-parent-links-warnings">
              {[...new Set(warnings.map(warningText))].map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Summary fileName={fileName} summary={summary} done />

      <div className="actions-row import-parent-links-tools">
        <OnlyErrorsToggle checked={onlyErrors} onChange={setOnlyErrors} count={summary.invalid} />
      </div>
      <ResultTable rows={result.rows} onlyErrors={onlyErrors} />

      <div className="section-sep" />
      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onAgain}>
          Nhập file khác
        </button>
        <Link to="/students" className="btn btn-primary">
          Về danh sách học sinh
        </Link>
      </div>
    </section>
  );
}

export default function ImportParentLinksPage() {
  const toast = useToast();
  const [step, setStep] = useState('upload'); // upload | preview | done
  const [file, setFile] = useState(null); // kept in memory: the import sends this same File again
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false); // a second click before React re-renders must not send a second request
  const checkId = useRef(0); // only the answer for the latest chosen file is shown

  async function check(chosen = file) {
    if (!chosen || inFlight.current) return;
    inFlight.current = true;
    const id = ++checkId.current;
    setBusy(true);
    setError('');
    try {
      const data = await previewParentLinks(chosen);
      if (id !== checkId.current) return;
      setPreview(data);
      setStep('preview');
    } catch (err) {
      if (id === checkId.current) setError(fileErrorText(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function pick(chosen) {
    setFile(chosen);
    setPreview(null);
    check(chosen); // the preview starts at once, no extra click
  }

  async function doImport() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const data = await importParentLinks(file);
      setResult(data);
      setConfirming(false);
      setStep('done');
      toast(`Đã lưu ${number(data.summary.imported)} liên kết phụ huynh.`);
    } catch (err) {
      setConfirming(false);
      setError(fileErrorText(err));
      // The data changed since the preview (e.g. a link was added meanwhile): show the fresh check, as UC-96 does.
      if (err.code === 'MSG_IMPORT_NO_VALID_ROWS') {
        try {
          setPreview(await previewParentLinks(file));
        } catch {
          // keep the previous preview; the error above is shown
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function startAgain() {
    checkId.current += 1;
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    setStep('upload');
  }

  const stepIndex = { upload: 1, preview: 2, done: 3 }[step];

  return (
    <div className="import-parent-links">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Hồ sơ</span>/<Link to="/students">Học sinh</Link>/
        <span className="current">Nhập liên kết phụ huynh</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Nhập liên kết phụ huynh</h1>
          <p>Liên kết nhiều phụ huynh với học sinh cùng lúc từ file Excel hoặc CSV. Hệ thống kiểm tra từng dòng trước khi lưu.</p>
        </div>
      </div>

      <ol className="wizard-steps" aria-label={`Bước ${stepIndex} trên 3`}>
        {['Chọn file', 'Kiểm tra', 'Hoàn tất'].map((label, i) => (
          <li key={label} className={i + 1 < stepIndex ? 'done' : i + 1 === stepIndex ? 'current' : undefined}>
            <span className="dot">{i + 1 < stepIndex ? <Icon name="check" size="sm" /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 'upload' && <UploadStep file={file} busy={busy} error={error} onPick={pick} onCheck={() => check()} />}
      {step === 'preview' && preview && (
        <PreviewStep
          fileName={file?.name}
          preview={preview}
          busy={busy}
          error={error}
          onBack={() => {
            setError('');
            setStep('upload');
          }}
          onImport={() => {
            setError('');
            setConfirming(true);
          }}
        />
      )}
      {step === 'done' && result && <DoneStep fileName={file?.name} result={result} onAgain={startAgain} />}

      {preview && (
        <ConfirmDialog
          open={confirming}
          summary={preview.summary}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={doImport}
        />
      )}
    </div>
  );
}
