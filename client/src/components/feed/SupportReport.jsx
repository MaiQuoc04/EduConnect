import { useId } from 'react';
import Icon from '../Icon.jsx';
import { MAX_SUPPORT_NOTE_LENGTH } from '../../utils/moderation.js';

// "Cần được hỗ trợ" in the report queues (moderation phase 5, FE-08 Anh, 25/11/2026), shared by the comment report card
// (pages/schoolfeed/CommentReportCard: the School Manager's tab "Báo cáo bình luận" of "Quy chuẩn cộng đồng" since
// 27/11/2026, and the homeroom teachers' pages/groupfeed/GroupCommentReportsPage) and the message reports tab. Server rules (utils/commentReports.js resolveReport): a pending NEEDS_SUPPORT report needs a
// "Kết quả hỗ trợ" to decide; when every report is NEEDS_SUPPORT only "Ghi nhận" (DISMISS) is possible.

const lengthOf = (text) => [...text.normalize('NFC').trim()].length;

/** The highlighted label of an item with a "Cần được hỗ trợ" report. */
export function SupportBadge() {
  return (
    <span className="pill amber cr-support-badge">
      <Icon name="support" size="sm" />
      Cần được hỗ trợ
    </span>
  );
}

/** True when the "Kết quả hỗ trợ" typed is acceptable (required and within the limit). */
export const supportNoteOk = (text) => lengthOf(text) > 0 && lengthOf(text) <= MAX_SUPPORT_NOTE_LENGTH;

/** The "Kết quả hỗ trợ" box of a pending item with a NEEDS_SUPPORT report (controlled). */
export function SupportNoteField({ value, onChange, disabled, writer = 'Người viết bình luận' }) {
  const id = useId();
  const length = lengthOf(value);
  return (
    <div className="field cr-support-note">
      <label htmlFor={id}>
        Kết quả hỗ trợ <span className="caption muted">(bắt buộc)</span>
      </label>
      <textarea
        id={id}
        className="input"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Ví dụ: đã báo giáo viên chủ nhiệm, đã liên hệ phụ huynh, đã gặp riêng học sinh…"
        aria-invalid={length > MAX_SUPPORT_NOTE_LENGTH}
        aria-describedby={`${id}-help`}
      />
      <span id={`${id}-help`} className={`caption muted mono${length > MAX_SUPPORT_NOTE_LENGTH ? ' cr-over' : ''}`}>
        {length.toLocaleString('vi-VN')} / {MAX_SUPPORT_NOTE_LENGTH.toLocaleString('vi-VN')} · {writer} không bao giờ thấy nội dung này.
      </span>
    </div>
  );
}

/** The "Kết quả hỗ trợ" recorded with a decided item. */
export function SupportNoteResult({ note }) {
  if (!note) return null;
  return (
    <p className="cr-support-result">
      <Icon name="support" size="sm" />
      <span>
        <span className="caption muted">Kết quả hỗ trợ:</span> {note}
      </span>
    </p>
  );
}
