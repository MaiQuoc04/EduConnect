import { useState } from 'react';
import { downloadGradeTemplate, previewGradeImport } from '../../api/grades.js';
import Icon from '../../components/Icon.jsx';
import { errorText } from '../../messages.js';
import Dialog from '../admin/Dialog.jsx';

// UC-84 Import Grades: download the grade book as Excel (current scores filled in), edit, upload and check. "Nhập điểm"
// does NOT save: the checked scores are put into the grid as unsaved edits; the teacher can still correct them by hand
// and saves with "Lưu điểm" (UC-83), which logs the changes like any other edit (FE-11 owner, 14/11/2026).
// A file with any error cannot be applied; an empty cell keeps the current score.
const ROW_ERROR = {
  CODE_REQUIRED: () => 'Thiếu mã học sinh.',
  CODE_UNKNOWN: (e) => `Mã ${e.value} không phải học sinh đang học của lớp.`,
  CODE_DUPLICATE: (e) => `Mã ${e.value} bị lặp trong file.`,
  SCORE_INVALID: (e) => `Cột ${e.column}: "${e.value}" không phải điểm hợp lệ (0–10, tối đa 2 chữ số thập phân).`,
};

export default function GradeImportPanel({ book, onClose, onApply }) {
  const { classId } = book.class;
  const { subjectId } = book.subject;
  const { semesterId } = book.semester;
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      if (action === 'template') await downloadGradeTemplate(classId, subjectId, semesterId);
      if (action === 'preview') setPreview(await previewGradeImport(classId, subjectId, semesterId, file));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // Only the rows with errors are listed; a valid file shows one line (the scores are checked in the grid).
  const errorRows = preview?.rows.filter((r) => r.errors.length) ?? [];

  return (
    <Dialog
      title="Nhập điểm từ Excel"
      icon="upload_file"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Đóng
          </button>
          {preview ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onApply(preview.rows.flatMap((r) => r.changes))}
              disabled={busy || preview.errorCount > 0 || !preview.changeCount}
            >
              Nhập điểm
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => run('preview')} disabled={busy || !file}>
              {busy ? 'Đang kiểm tra…' : 'Kiểm tra file'}
            </button>
          )}
        </>
      }
    >
      <div className="import-box">
        <p>
          1. Tải file mẫu: sổ điểm {book.subject.subjectName} lớp {book.class.className} kèm điểm hiện có.{' '}
          <button type="button" className="link-button" onClick={() => run('template')} disabled={busy}>
            <Icon name="download" size="sm" /> Tải file mẫu
          </button>
        </p>
        <p>2. Điền điểm (ô trống = giữ nguyên điểm cũ), lưu file rồi chọn file để kiểm tra.</p>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setError('');
          }}
        />
        {preview && (
          <>
            <p className={preview.errorCount ? 'form-error' : 'caption muted'}>
              {preview.errorCount
                ? `${preview.errorCount} dòng có lỗi. Sửa file rồi chọn lại.`
                : preview.changeCount
                  ? 'File hợp lệ. Bấm Nhập điểm để đưa điểm vào bảng, kiểm tra rồi bấm Lưu điểm.'
                  : 'File không thay đổi điểm nào.'}
            </p>
            {errorRows.length > 0 && (
              <div className="import-preview">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Học sinh</th>
                      <th>Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>
                          {r.fullName ?? '—'}
                          <div className="caption muted mono">{r.studentCode}</div>
                        </td>
                        <td>
                          {r.errors.map((e, i) => (
                            <div key={i} className="err">
                              {ROW_ERROR[e.code]?.(e) ?? e.code}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            <Icon name="error" size="sm" />
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
