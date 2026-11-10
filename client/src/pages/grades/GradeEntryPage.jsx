import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { finalizeBook, getBook, listMyBooks, saveGrades } from '../../api/grades.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import Dialog from '../admin/Dialog.jsx';
import '../admin/admin.css';
import GradeBookTable from './GradeBookTable.jsx';
import GradeImportPanel from './GradeImportPanel.jsx';
import { BOOK_STATUS, formatDateTime, toApiScore, validScore } from './gradeFormat.js';
import SemesterSelect from './SemesterSelect.jsx';
import useGradeOptions from './useGradeOptions.js';
import './grades.css';

// SCR-44 Grade Entry (teacher) – UC-83 Enter Grades, UC-84 Import Grades, UC-85 Finalize Grades, for the classes and
// subjects the teacher is assigned to now. The choice lives in the URL (?semesterId&classId&subjectId).

export default function GradeEntryPage() {
  const toast = useToast();
  const options = useGradeOptions();
  const [params, setParams] = useSearchParams();
  const semesterId = params.get('semesterId') ?? '';
  const bookKey = params.get('book') ?? ''; // "classId:subjectId"
  const [books, setBooks] = useState({ loading: false, items: [], error: '' });
  const [book, setBook] = useState({ loading: false, data: null, error: '' });
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null); // 'finalize' | 'import' | 'discard'
  const [finalizeError, setFinalizeError] = useState(null);

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

  useEffect(() => {
    if (!semesterId) return;
    let alive = true;
    setBooks((s) => ({ ...s, loading: true, error: '' }));
    listMyBooks(semesterId)
      .then((d) => alive && setBooks({ loading: false, items: d.items, error: '' }))
      .catch((err) => alive && setBooks({ loading: false, items: [], error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [semesterId]);

  useEffect(() => {
    if (!books.items.length) return;
    if (!books.items.some((b) => `${b.classId}:${b.subjectId}` === bookKey)) {
      const first = books.items.find((b) => b.hasStructure) ?? books.items[0]; // prefer a book that can be entered
      update({ book: `${first.classId}:${first.subjectId}` });
    }
  }, [books.items, bookKey, update]);

  const [classId, subjectId] = bookKey.split(':');
  const loadBook = useCallback(() => {
    if (!semesterId || !classId || !subjectId) return;
    setBook((s) => ({ ...s, loading: true, error: '' }));
    getBook(classId, subjectId, semesterId)
      .then((data) => {
        setBook({ loading: false, data, error: '' });
        setEdits({});
      })
      .catch((err) => setBook({ loading: false, data: null, error: errorText(err) }));
  }, [semesterId, classId, subjectId]);
  useEffect(loadBook, [loadBook]);

  const changedKeys = Object.keys(edits);
  const invalid = changedKeys.some((k) => !validScore(edits[k]));
  const data = book.data;
  const status = BOOK_STATUS[data?.lock.status ?? 'OPEN'];

  // Leaving with unsaved scores: ask first (browser close / reload).
  useEffect(() => {
    if (!changedKeys.length) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changedKeys.length]);

  function onEdit(key, value, savedText) {
    setEdits((e) => {
      const next = { ...e };
      if (value.trim() === savedText) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function choose(changes) {
    if (changedKeys.length && !window.confirm('Có điểm chưa lưu. Bỏ các thay đổi này?')) return;
    update(changes);
  }

  async function save() {
    setSaving(true);
    try {
      const changes = changedKeys.map((k) => {
        const [enrollmentId, componentId, attemptNo] = k.split(':').map(Number);
        return { enrollmentId, componentId, attemptNo, score: toApiScore(edits[k]) };
      });
      const result = await saveGrades(classId, subjectId, semesterId, changes);
      setBook({ loading: false, data: result.book, error: '' });
      setEdits({});
      toast(result.changed ? `Đã lưu ${result.changed} điểm.` : 'Không có điểm nào thay đổi.');
    } catch (err) {
      toast(errorText(err), { type: 'error' });
      if (['MSG_GRADES_FINALIZED', 'MSG_STRUCTURE_EMPTY'].includes(err.code)) loadBook();
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    setSaving(true);
    setFinalizeError(null);
    try {
      const data2 = await finalizeBook(classId, subjectId, semesterId);
      setBook({ loading: false, data: data2, error: '' });
      setDialog(null);
      toast('Đã chốt điểm. Sổ điểm đã được khoá.');
      setBooks((s) => ({ ...s, items: s.items.map((b) => (`${b.classId}:${b.subjectId}` === bookKey ? { ...b, status: 'LOCKED' } : b)) }));
    } catch (err) {
      setFinalizeError(err);
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map();
    for (const b of books.items) {
      if (!map.has(b.className)) map.set(b.className, []);
      map.get(b.className).push(b);
    }
    return [...map];
  }, [books.items]);

  return (
    <div className="grade-wide">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Học tập</span>/<span className="current">Nhập điểm</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Nhập điểm</h1>
          <p>Sổ điểm các lớp và môn bạn đang được phân công dạy. Điểm từ 0 đến 10, tối đa 2 chữ số thập phân.</p>
        </div>
      </div>

      <div className="grade-toolbar">
        <SemesterSelect semesters={options.semesters} value={semesterId} onChange={(v) => choose({ semesterId: v, book: '' })} />
        <label className="field grow" htmlFor="book">
          <span className="field-label">Lớp – môn</span>
          <select id="book" className="input" value={bookKey} onChange={(e) => choose({ book: e.target.value })} disabled={!books.items.length}>
            {grouped.map(([className, items]) => (
              <optgroup key={className} label={`Lớp ${className}`}>
                {items.map((b) => (
                  <option key={`${b.classId}:${b.subjectId}`} value={`${b.classId}:${b.subjectId}`}>
                    {b.className} – {b.subjectName} ({BOOK_STATUS[b.status].label.toLowerCase()})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {data && (
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => setDialog('import')} disabled={!data.canEdit || changedKeys.length > 0}>
              <Icon name="upload_file" size="sm" /> Nhập từ Excel
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setFinalizeError(null); setDialog('finalize'); }} disabled={!data.canFinalize || changedKeys.length > 0}>
              <Icon name="lock" size="sm" /> Chốt điểm
            </button>
          </div>
        )}
      </div>

      {(options.error || books.error || book.error) && <p className="form-error">{options.error || books.error || book.error}</p>}
      {!books.loading && semesterId && !books.items.length && !books.error && (
        <div className="notice">
          <Icon name="info" />
          <p>Bạn chưa được phân công dạy lớp nào trong năm học của học kỳ này.</p>
        </div>
      )}

      {data && (
        <section className="card card-outline">
          <div className="results-head">
            <h2 className="title-md">
              {data.subject.subjectName} · Lớp {data.class.className} · Học kỳ {data.semester.semesterNo}, {data.semester.yearName}
            </h2>
            <span className={`gtag ${status.tone}`}>{status.label}</span>
            {data.lock.status === 'LOCKED' && (
              <span className="caption muted">
                Chốt lúc {formatDateTime(data.lock.lockedAt)} bởi {data.lock.lockedBy}
              </span>
            )}
            {data.lock.status === 'UNLOCKED' && (
              <span className="caption muted">
                Mở khoá lúc {formatDateTime(data.lock.unlockedAt)} bởi {data.lock.unlockedBy} – sửa xong hãy chốt lại
              </span>
            )}
          </div>

          {!data.components.length ? (
            <div className="notice amber">
              <Icon name="warning" />
              <p>Môn này chưa có cấu trúc điểm cho khối {data.class.gradeLevelName}. Liên hệ quản lý nhà trường để cấu hình.</p>
            </div>
          ) : (
            <>
              {data.lock.status === 'LOCKED' && (
                <div className="notice ink" style={{ marginBottom: 12 }}>
                  <Icon name="lock" />
                  <p>Sổ điểm đã chốt. Muốn sửa, hãy đề nghị quản lý nhà trường mở khoá.</p>
                </div>
              )}
              <GradeBookTable book={data} edits={edits} onEdit={onEdit} editable={data.canEdit} />
              {data.canEdit && (
                <div className="book-footer">
                  <span className="left">
                    {changedKeys.length
                      ? `${changedKeys.length} ô đã sửa, chưa lưu.${invalid ? ' Có ô không hợp lệ (tô đỏ).' : ''}`
                      : 'Xoá trắng một ô rồi lưu để xoá điểm đó.'}
                  </span>
                  <button type="button" className="btn btn-secondary" onClick={() => setEdits({})} disabled={!changedKeys.length || saving}>
                    Bỏ thay đổi
                  </button>
                  <button type="button" className="btn btn-primary" onClick={save} disabled={!changedKeys.length || invalid || saving}>
                    {saving ? 'Đang lưu…' : 'Lưu điểm'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {dialog === 'finalize' && data && (
        <Dialog
          title="Chốt điểm"
          icon="lock"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)} disabled={saving}>
                Huỷ
              </button>
              <button type="button" className="btn btn-primary" onClick={finalize} disabled={saving}>
                {saving ? 'Đang chốt…' : 'Chốt điểm'}
              </button>
            </>
          }
        >
          <p>
            Chốt sổ điểm <strong>{data.subject.subjectName}</strong> lớp <strong>{data.class.className}</strong>, học kỳ{' '}
            {data.semester.semesterNo}? Sau khi chốt, bạn không sửa được điểm nữa cho đến khi quản lý nhà trường mở khoá.
          </p>
          {finalizeError && (
            <div className="form-error" role="alert">
              <Icon name="error" size="sm" />
              <div>
                {errorText(finalizeError)}
                {finalizeError.code === 'MSG_GRADES_INCOMPLETE' && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {finalizeError.details?.students.map((s) => (
                      <li key={s.studentCode}>
                        {s.fullName} ({s.studentCode}): thiếu {s.missing} điểm
                      </li>
                    ))}
                    {finalizeError.details?.count > (finalizeError.details?.students.length ?? 0) && <li>…</li>}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Dialog>
      )}

      {dialog === 'import' && data && (
        <GradeImportPanel
          book={data}
          onClose={() => setDialog(null)}
          onImported={(result) => {
            setBook({ loading: false, data: result.book, error: '' });
            setDialog(null);
            toast(`Đã nhập ${result.changed} điểm từ file.`);
          }}
        />
      )}
    </div>
  );
}
