import { useState } from 'react';
import { exportGradeBook } from '../../api/grades.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';

// "Xuất Excel" for one grade book (class × subject × semester): downloads every student's scores and averages.
// Used on SCR-44 Grade Entry (teacher) and in the SCR-68 book view (School Manager).
export default function ExportButton({ classId, subjectId, semesterId, disabled }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await exportGradeBook(classId, subjectId, semesterId);
    } catch (err) {
      // A blob error response has no parsed body: show the generic message of its status.
      toast(errorText(err), { type: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn btn-secondary" onClick={run} disabled={disabled || busy} title={disabled ? 'Môn này chưa có cấu trúc điểm' : ''}>
      <Icon name="download" size="sm" /> {busy ? 'Đang xuất…' : 'Xuất Excel'}
    </button>
  );
}
