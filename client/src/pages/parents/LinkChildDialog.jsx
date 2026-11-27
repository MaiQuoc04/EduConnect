import { useEffect, useId, useRef, useState } from 'react';
import { linkParent, listStudents } from '../../api/students.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText, RELATIONSHIP_LABELS } from '../../messages.js';
import './LinkChildDialog.css';

// UC-13 from the parent's side (FE-14 Anh, 27/11/2026): School Manager links a student to the parent shown on SCR-10.
// Client only: the student is found with UC-07 (GET /students?q=) and the link is the same UC-13 call as SCR-13
// (POST /students/:studentId/parents). The server still checks every rule (max 2 parents, link already exists,
// relationship type), so this dialog only greys out the students that would obviously be refused.

const MAX_PARENTS = 2; // business-rules §3
const RELATIONSHIP_TYPES = ['FATHER', 'MOTHER', 'GUARDIAN']; // sent exactly like this (the server is case sensitive)
const MIN_QUERY_LENGTH = 2;
const SEARCH_DELAY_MS = 300;
const SEARCH_PAGE_SIZE = 8;
const LINK_ERROR = 'Không liên kết được học sinh. Vui lòng thử lại.';
// Same texts as SCR-13: the link also adds the parent to the student's class groups (FE-04).
const WARNING_TEXTS = {
  WARN_STUDENT_HAS_NO_CLASS: 'Học sinh chưa thuộc lớp nào nên chưa thay đổi nhóm lớp.',
  WARN_CLASS_HAS_NO_GROUPS: 'Lớp chưa có nhóm lớp, phụ huynh chưa được thêm vào nhóm nào.',
  WARN_CLASS_GROUPS_MISSING: 'Lớp còn thiếu một số nhóm lớp, phụ huynh chưa được thêm vào các nhóm đó.',
};
const WARNING_FALLBACK = 'Đã liên kết nhưng còn một việc chưa thực hiện được. Vui lòng kiểm tra lại nhóm lớp.';

function linkErrorText(err) {
  const general = errorText({ code: 'SERVER_ERROR' });
  const known = errorText({ code: err.code, details: err.details });
  if (known !== general || err.code === 'SERVER_ERROR') return known;
  console.warn(`[LinkChildDialog] No Vietnamese message for error code ${err.code}:`, err.message);
  return LINK_ERROR;
}

// Why a student cannot be picked, or '' when they can.
function blockedReason(student, linkedIds) {
  if (linkedIds.has(student.studentId)) return 'Đã liên kết với phụ huynh này';
  if ((student.parentCount ?? 0) >= MAX_PARENTS) return `Đã đủ ${MAX_PARENTS} phụ huynh`;
  return '';
}

export default function LinkChildDialog({ open, parent, linkedStudentIds, onClose, onLinked }) {
  const ref = useRef(null);
  const titleId = useId();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState(null);
  const [relationship, setRelationship] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const linkedIds = new Set(linkedStudentIds);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) {
      setQuery('');
      setResults(null);
      setSearchError('');
      setSelected(null);
      setRelationship('');
      setFormError('');
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!open || selected || q.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      listStudents({ q, page: 1, pageSize: SEARCH_PAGE_SIZE }, { signal: controller.signal })
        .then((data) => {
          // One row per student (the list can return a student once per enrollment).
          const seen = new Set();
          setResults((data.items ?? []).filter((s) => !seen.has(s.studentId) && seen.add(s.studentId)));
          setSearchError('');
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchError('Không tìm được học sinh. Vui lòng thử lại.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected, open]);

  async function submit(e) {
    e.preventDefault();
    if (!selected || !RELATIONSHIP_TYPES.includes(relationship) || busy) return;
    setBusy(true);
    setFormError('');
    try {
      const res = await linkParent(selected.studentId, { parentId: parent.parentId, relationshipType: relationship });
      toast(`Đã liên kết học sinh ${selected.fullName} với phụ huynh ${parent.fullName}.`);
      for (const w of res.warnings ?? []) {
        if (!WARNING_TEXTS[w.code]) console.warn(`[LinkChildDialog] No Vietnamese message for warning ${w.code}:`, w.message);
        toast(WARNING_TEXTS[w.code] ?? WARNING_FALLBACK);
      }
      onLinked();
    } catch (err) {
      setFormError(linkErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(selected) && RELATIONSHIP_TYPES.includes(relationship) && !busy;

  return (
    <dialog
      ref={ref}
      className="link-child-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {open && (
        <form onSubmit={submit}>
          <div className="link-child-head">
            <span className="link-child-icon">
              <Icon name="person_add" />
            </span>
            <div>
              <h2 id={titleId} className="title-sm">
                Liên kết con
              </h2>
              <p className="caption muted">
                Phụ huynh {parent.fullName}
                {parent.phone && <span className="mono"> · {parent.phone}</span>}
              </p>
            </div>
          </div>

          {selected ? (
            <div className="link-child-selected">
              <Avatar src={selected.avatarUrl} name={selected.fullName} size={40} />
              <div>
                <p className="label-upper">Học sinh được chọn</p>
                <p className="strong">{selected.fullName}</p>
                <p className="caption muted">
                  <span className="mono">{selected.studentCode}</span>
                  {selected.className && ` · Lớp ${selected.className}`}
                  {` · ${selected.parentCount ?? 0}/${MAX_PARENTS} phụ huynh`}
                </p>
              </div>
              <button type="button" className="btn btn-tertiary" onClick={() => setSelected(null)} disabled={busy}>
                Chọn học sinh khác
              </button>
            </div>
          ) : (
            <div className="field">
              <label className="field-label" htmlFor="link-child-search">
                Tìm học sinh
              </label>
              <div className="input-wrap">
                <Icon name="search" size="sm" className="link-child-input-icon" />
                <input
                  id="link-child-search"
                  className="input link-child-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nhập họ tên hoặc mã học sinh"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <span className="field-help">Mỗi học sinh được liên kết tối đa {MAX_PARENTS} phụ huynh.</span>
              <div aria-live="polite">
                {searchError && <p className="field-error">{searchError}</p>}
                {searching && <p className="caption muted">Đang tìm…</p>}
                {!searching && results?.length === 0 && <p className="caption muted">Không có học sinh phù hợp.</p>}
              </div>
              {!searching && results?.length > 0 && (
                <ul className="link-child-options" role="list">
                  {results.map((s) => {
                    const reason = blockedReason(s, linkedIds);
                    return (
                      <li key={s.studentId}>
                        <button
                          type="button"
                          className="link-child-option"
                          onClick={() => setSelected(s)}
                          disabled={Boolean(reason)}
                        >
                          <Avatar src={s.avatarUrl} name={s.fullName} size={36} />
                          <span>
                            <span className="strong">{s.fullName}</span>
                            <span className="caption muted">
                              <span className="mono">{s.studentCode}</span>
                              {s.className && ` · Lớp ${s.className}`}
                              {' · '}
                              {reason || `${s.parentCount ?? 0}/${MAX_PARENTS} phụ huynh`}
                            </span>
                          </span>
                          {!reason && <Icon name="chevron_right" size="sm" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="link-child-relationship">
              Quan hệ với học sinh
            </label>
            <select
              id="link-child-relationship"
              className="input"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              disabled={busy}
            >
              <option value="">Chọn quan hệ</option>
              {RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RELATIONSHIP_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <div className="form-error" role="alert">
              <Icon name="error" size="sm" />
              <p>{formError}</p>
            </div>
          )}

          <div className="link-child-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Quay lại
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              <Icon name={busy ? 'progress_activity' : 'link'} size="sm" className={busy ? 'link-child-spin' : undefined} />
              {busy ? 'Đang liên kết…' : 'Liên kết'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
