import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadImportTemplate, importAccounts, previewImport, saveBlob } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { FIELD_LABELS, fieldText } from './accountFields.js';
import './admin.css';

// Import Accounts (UC-93, FE-13): choose the account type → download the template → upload the file → check the
// preview → import the valid rows → download the one-time file with usernames and temporary passwords.

const TYPES = [
  { value: 'STUDENT', label: 'Học sinh', icon: 'school', code: 'Mã học sinh' },
  { value: 'TEACHER', label: 'Giáo viên', icon: 'co_present', code: 'Mã giáo viên' },
  { value: 'PARENT', label: 'Phụ huynh', icon: 'family_restroom' },
  { value: 'SCHOOL_MANAGER', label: 'Quản lý nhà trường', icon: 'domain' },
];
const ACCEPT = '.xlsx,.csv';

const fileSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function FormError({ text }) {
  if (!text) return null;
  return (
    <p className="form-error" role="alert">
      <Icon name="error" size="sm" />
      {text}
    </p>
  );
}

// Step 1: type, template, file.
function UploadStep({ type, setType, file, setFile, busy, error, onCheck }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const typeInfo = TYPES.find((t) => t.value === type);

  function pick(chosen) {
    if (!chosen) return;
    if (!/\.(xlsx|csv)$/i.test(chosen.name)) {
      toast('Chỉ chấp nhận file .xlsx hoặc .csv.', { type: 'error' });
      return;
    }
    setFile(chosen);
  }

  async function template() {
    try {
      await downloadImportTemplate(type);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    }
  }

  return (
    <section className="card card-outline admin-form">
      <h2 className="card-title title-sm">
        <span className="step-no">1</span>
        Loại tài khoản
      </h2>
      <div className="role-picker" role="radiogroup" aria-label="Loại tài khoản">
        {TYPES.map((t) => (
          <label key={t.value} className={`role-option${type === t.value ? ' checked' : ''}`}>
            <input type="radio" name="type" checked={type === t.value} onChange={() => setType(t.value)} />
            {t.label}
          </label>
        ))}
      </div>
      <p className="caption muted" style={{ marginTop: 8 }}>
        Mỗi file chỉ chứa một loại tài khoản. Tài khoản Quản trị hệ thống được tạo từng tài khoản một.
      </p>

      <div className="section-sep" />
      <h2 className="card-title title-sm">
        <span className="step-no">2</span>
        Điền file mẫu
      </h2>
      <div className="actions-row">
        <button type="button" className="btn btn-secondary" onClick={template}>
          <Icon name="download" size="sm" />
          Tải file mẫu {typeInfo.label.toLowerCase()}
        </button>
        <span className="caption muted">Cột có dấu * là bắt buộc. Xem trang "Huong dan" trong file mẫu.</span>
      </div>

      <div className="section-sep" />
      <h2 className="card-title title-sm">
        <span className="step-no">3</span>
        Chọn file đã điền
      </h2>
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
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
          <Icon name={file ? 'description' : 'upload_file'} />
        </span>
        {file ? (
          <>
            <p style={{ fontWeight: 500 }}>{file.name}</p>
            <p className="caption muted">
              {fileSize(file.size)} · <span style={{ textDecoration: 'underline' }}>chọn file khác</span>
            </p>
          </>
        ) : (
          <>
            <p>
              Kéo file vào đây hoặc <span style={{ color: 'var(--ink-700)', textDecoration: 'underline' }}>chọn file</span>
            </p>
            <p className="caption muted">Định dạng .xlsx hoặc .csv (UTF-8), tối đa 500 dòng.</p>
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
        <div style={{ marginTop: 20 }}>
          <FormError text={error} />
        </div>
      )}

      <div className="section-sep" />
      <div className="card-footer">
        <Link to="/admin/accounts" className="btn btn-secondary">
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

function RowErrors({ row }) {
  const entries = Object.entries(row.errors);
  if (!entries.length) return <span className="pill green">Hợp lệ</span>;
  return (
    <ul className="row-errors">
      {entries.map(([field, code]) => (
        <li key={field}>
          <strong>{FIELD_LABELS[field] ?? field}:</strong> {fieldText(field, code, row.duplicateOf?.[field])}
        </li>
      ))}
    </ul>
  );
}

// Step 2: preview of every row; nothing is saved yet.
function PreviewStep({ preview, typeInfo, busy, error, onBack, onImport }) {
  const [onlyErrors, setOnlyErrors] = useState(preview.invalidCount > 0);
  const rows = onlyErrors ? preview.rows.filter((r) => Object.keys(r.errors).length) : preview.rows;
  return (
    <section className="card card-outline admin-wide">
      <div className="import-summary">
        <div>
          <span className="label-upper">File</span>
          <p className="summary-file">{preview.fileName}</p>
          <p className="caption muted">Tài khoản {typeInfo.label.toLowerCase()}</p>
        </div>
        <div className="stat">
          <span className="label-upper">Tổng số dòng</span>
          <strong>{preview.total}</strong>
        </div>
        <div className="stat ok">
          <span className="label-upper">Hợp lệ</span>
          <strong>{preview.validCount}</strong>
        </div>
        <div className={`stat${preview.invalidCount ? ' bad' : ''}`}>
          <span className="label-upper">Có lỗi</span>
          <strong>{preview.invalidCount}</strong>
        </div>
      </div>

      <div className="actions-row" style={{ margin: '20px 0 12px' }}>
        <label className="check-inline">
          <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
          Chỉ xem các dòng có lỗi
        </label>
        <span className="caption muted push">Tên đăng nhập là dự kiến; hệ thống chốt khi nhập.</span>
      </div>

      <div className="table-scroll">
        <table className="table import-table">
          <thead>
            <tr>
              <th>Dòng</th>
              <th>Họ và tên</th>
              {typeInfo.code && <th>{typeInfo.code}</th>}
              <th>Email</th>
              <th>Số điện thoại</th>
              <th>Tên đăng nhập</th>
              <th>Kết quả kiểm tra</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row} className={Object.keys(r.errors).length ? 'has-error' : undefined}>
                <td className="mono muted">{r.row}</td>
                <td style={{ fontWeight: 500 }}>{r.fullName || <span className="muted">(trống)</span>}</td>
                {typeInfo.code && <td className="mono">{r.code}</td>}
                <td>{r.email}</td>
                <td className="mono">{r.phone}</td>
                <td className="mono">{r.username ?? '—'}</td>
                <td>
                  <RowErrors row={r} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="muted">
                  Không có dòng nào có lỗi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div style={{ marginTop: 20 }}>
          <FormError text={error} />
        </div>
      )}

      <div className="section-sep" />
      <div className="card-footer">
        {preview.invalidCount > 0 && preview.validCount > 0 && (
          <span className="left">
            <Icon name="info" size="sm" />
            {preview.invalidCount} dòng có lỗi sẽ được bỏ qua.
          </span>
        )}
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>
          Chọn file khác
        </button>
        <button type="button" className="btn btn-primary" onClick={onImport} disabled={busy || !preview.validCount}>
          <Icon name="group_add" size="sm" />
          {busy ? 'Đang nhập…' : `Nhập ${preview.validCount} tài khoản hợp lệ`}
        </button>
      </div>
    </section>
  );
}

// Step 3: created accounts and the one-time credentials file.
function DoneStep({ result, typeInfo, onAgain }) {
  const [downloaded, setDownloaded] = useState(false);
  function download() {
    saveBlob(result.file.base64, result.file.name, result.file.contentType);
    setDownloaded(true);
  }
  return (
    <section className="card card-outline admin-wide">
      <div className="notice ink" style={{ marginBottom: 16 }}>
        <Icon name="check_circle" />
        <div>
          <p className="notice-title">
            Đã tạo {result.createdCount} tài khoản {typeInfo.label.toLowerCase()}
          </p>
          <p>{result.skippedCount ? `${result.skippedCount} dòng có lỗi đã được bỏ qua.` : 'Mọi dòng trong file đều đã được nhập.'}</p>
        </div>
      </div>
      <div className="notice amber" style={{ marginBottom: 20 }}>
        <Icon name="warning" />
        <div>
          <p className="notice-title">Tải file tài khoản ngay</p>
          <p>
            Mật khẩu tạm thời chỉ hiển thị một lần, trên trang này. Hãy tải file và bàn giao cho người dùng; mỗi người
            phải đổi mật khẩu ở lần đăng nhập đầu tiên.
          </p>
        </div>
      </div>
      <div className="actions-row" style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn-primary" onClick={download}>
          <Icon name="download" size="sm" />
          Tải file tài khoản (.xlsx)
        </button>
        {downloaded && (
          <span className="caption" style={{ color: 'var(--green)' }}>
            Đã tải {result.file.name}
          </span>
        )}
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Họ và tên</th>
              {typeInfo.code && <th>{typeInfo.code}</th>}
              <th>Tên đăng nhập</th>
              <th>Mật khẩu tạm thời</th>
            </tr>
          </thead>
          <tbody>
            {result.accounts.map((a, i) => (
              <tr key={a.id}>
                <td className="mono muted">{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{a.fullName}</td>
                {typeInfo.code && <td className="mono">{a.code}</td>}
                <td className="mono">{a.username}</td>
                <td className="secret-cell">{a.temporaryPassword}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-sep" />
      <div className="card-footer">
        {!downloaded && (
          <span className="left" style={{ color: 'var(--amber)' }}>
            <Icon name="warning" size="sm" />
            Bạn chưa tải file tài khoản.
          </span>
        )}
        <button type="button" className="btn btn-secondary" onClick={onAgain}>
          Nhập file khác
        </button>
        <Link to="/admin/accounts" className="btn btn-primary">
          Xong
        </Link>
      </div>
    </section>
  );
}

export default function ImportAccountsPage() {
  const [step, setStep] = useState('upload'); // upload | preview | done
  const [type, setType] = useState('STUDENT');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const typeInfo = TYPES.find((t) => t.value === type);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const check = () =>
    run(async () => {
      setPreview(await previewImport(type, file));
      setStep('preview');
    });

  const doImport = () =>
    run(async () => {
      try {
        setResult(await importAccounts(type, file));
        setStep('done');
      } catch (err) {
        // The data changed since the check: show the fresh preview so the admin sees why.
        if (err.code === 'MSG_IMPORT_CONFLICT' || err.code === 'MSG_IMPORT_NO_VALID_ROWS') {
          setPreview(await previewImport(type, file));
        }
        throw err;
      }
    });

  function startAgain() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    setStep('upload');
  }

  const stepIndex = { upload: 1, preview: 2, done: 3 }[step];

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<Link to="/admin/accounts">Tài khoản</Link>/<span className="current">Nhập tài khoản từ file</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Nhập tài khoản từ file</h1>
          <p>Tạo nhiều tài khoản cùng lúc từ file Excel hoặc CSV. Hệ thống kiểm tra từng dòng trước khi lưu.</p>
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

      {step === 'upload' && (
        <UploadStep
          type={type}
          setType={(t) => {
            setType(t);
            setError('');
          }}
          file={file}
          setFile={(f) => {
            setFile(f);
            setError('');
          }}
          busy={busy}
          error={error}
          onCheck={check}
        />
      )}
      {step === 'preview' && (
        <PreviewStep
          preview={preview}
          typeInfo={typeInfo}
          busy={busy}
          error={error}
          onBack={() => {
            setError('');
            setStep('upload');
          }}
          onImport={doImport}
        />
      )}
      {step === 'done' && <DoneStep result={result} typeInfo={typeInfo} onAgain={startAgain} />}
    </>
  );
}
