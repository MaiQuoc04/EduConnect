import { useRef, useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, importRowText } from '../../messages.js';
import { yearLabel } from '../school-years/schoolYearLabels.js';

// SCR-22 – UC-27 Import Class List. Choose a file → the server checks it without writing (preview) → "Nhập" sends
// the same file again; the server checks again and writes every row or none.
export default function ClassImportPanel({ schoolYear, onCancel, onDone }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(''); // '' | 'checking' | 'importing' | 'template'
  const [error, setError] = useState('');

  const form = (f) => {
    const data = new FormData();
    data.append('schoolYearId', String(schoolYear.schoolYearId));
    data.append('file', f);
    return data;
  };

  async function check(f) {
    setFile(f);
    setPreview(null);
    setError('');
    if (!f) return;
    setBusy('checking');
    try {
      const { data } = await api.post('/classes/import/preview', form(f));
      setPreview(data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  }

  async function handleImport() {
    setBusy('importing');
    setError('');
    try {
      const { data } = await api.post('/classes/import', form(file));
      const { newClasses, existingClasses, students } = data.summary;
      toast(
        `Đã nhập ${students} học sinh vào ${newClasses + existingClasses} lớp` +
          (newClasses ? `, tạo mới ${newClasses} lớp cùng nhóm lớp.` : '.'),
      );
      onDone();
    } catch (err) {
      // The file changed meanwhile or the data changed: show the new problems.
      if (err.code === 'MSG_IMPORT_INVALID' && err.details) {
        setPreview((p) => ({ ...p, errors: err.details.errors, warnings: err.details.warnings }));
      }
      setError(errorText(err));
      setBusy('');
    }
  }

  async function downloadTemplate() {
    setBusy('template');
    try {
      const { data } = await api.get('/classes/import/template', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mau-nhap-danh-sach-lop.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('Không tải được file mẫu. Vui lòng thử lại.', { type: 'error' });
    } finally {
      setBusy('');
    }
  }

  const errors = preview?.errors ?? [];
  const warnings = preview?.warnings ?? [];
  const canImport = preview && errors.length === 0 && preview.summary.students > 0 && !busy;

  return (
    <section className="card card-outline class-panel">
      <div className="class-panel-head">
        <div>
          <p className="label-upper muted">Nhập danh sách lớp</p>
          <h2 className="title-md">Năm học {yearLabel(schoolYear.yearName)}</h2>
        </div>
        <button type="button" className="btn btn-tertiary" onClick={downloadTemplate} disabled={busy === 'template'}>
          <Icon name="download" size="sm" />
          Tải file mẫu
        </button>
      </div>

      <div className="import-file">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            check(e.target.files?.[0] ?? null);
            e.target.value = ''; // choosing the same file again re-checks it
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>
          <Icon name="upload_file" size="sm" />
          {file ? 'Chọn tệp khác' : 'Chọn tệp Excel'}
        </button>
        <span className="muted">
          {file ? file.name : 'Mỗi học sinh một dòng: Tên lớp, Khối, Loại lớp, Mã học sinh. Tài khoản học sinh phải có sẵn.'}
        </span>
      </div>

      {busy === 'checking' && <p className="muted">Đang kiểm tra tệp…</p>}

      {preview && (
        <>
          <dl className="import-stats">
            <div>
              <dt>Lớp mới</dt>
              <dd>{preview.summary.newClasses}</dd>
            </div>
            <div>
              <dt>Lớp bổ sung</dt>
              <dd>{preview.summary.existingClasses}</dd>
            </div>
            <div>
              <dt>Học sinh sẽ nhập</dt>
              <dd>{preview.summary.students}</dd>
            </div>
            <div>
              <dt>Phụ huynh vào nhóm</dt>
              <dd>{preview.summary.parents}</dd>
            </div>
          </dl>

          {preview.classes.length > 0 && (
            <div className="table-scroll">
              <table className="table import-table">
                <thead>
                  <tr>
                    <th>Lớp</th>
                    <th>Loại lớp</th>
                    <th>Trạng thái</th>
                    <th className="num">Học sinh mới</th>
                    <th className="num">Bỏ qua</th>
                    <th className="num">Phụ huynh</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.classes.map((c) => (
                    <tr key={c.className}>
                      <td className="subject-name">
                        {c.className} <span className="muted caption">· Khối {c.gradeLevel}</span>
                      </td>
                      <td>{c.trackName}</td>
                      <td>
                        {c.exists ? (
                          <span className="pill">Đã có, bổ sung học sinh</span>
                        ) : (
                          <span className="pill green">Lớp mới, tạo 3 nhóm</span>
                        )}
                      </td>
                      <td className="num">{c.newStudents}</td>
                      <td className="num">{c.skipped}</td>
                      <td className="num">{c.parents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errors.length > 0 && <RowList title={`${errors.length} lỗi cần sửa trong tệp`} items={errors} tone="error" />}
          {warnings.length > 0 && <RowList title={`${warnings.length} lưu ý`} items={warnings} tone="warn" />}
          {errors.length === 0 && preview.summary.students === 0 && (
            <div className="notice">
              <Icon name="info" />
              <p>Tệp không có học sinh mới nào để nhập.</p>
            </div>
          )}
          {preview.classes.some((c) => !c.hasHomeroom) && errors.length === 0 && (
            <p className="caption muted">
              Lớp chưa có giáo viên chủ nhiệm sẽ hiện cảnh báo; phân công chủ nhiệm ở màn Phân công giáo viên.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="card-footer">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy === 'importing'}>
          Huỷ
        </button>
        <button type="button" className="btn btn-primary" onClick={handleImport} disabled={!canImport}>
          {busy === 'importing' ? 'Đang nhập…' : preview ? `Nhập ${preview.summary.students} học sinh` : 'Nhập'}
        </button>
      </div>
    </section>
  );
}

// Problems listed by Excel row, errors in red and warnings in amber.
function RowList({ title, items, tone }) {
  return (
    <div className={`import-rows ${tone}`}>
      <p className="notice-title">
        <Icon name={tone === 'error' ? 'error' : 'warning'} size="sm" />
        {title}
      </p>
      <ul>
        {items.slice(0, 200).map((item, i) => (
          <li key={`${item.row}-${item.code}-${i}`}>
            <span className="mono">Dòng {item.row}</span>
            {importRowText(item)}
          </li>
        ))}
      </ul>
      {items.length > 200 && <p className="caption">… và {items.length - 200} dòng khác.</p>}
    </div>
  );
}
