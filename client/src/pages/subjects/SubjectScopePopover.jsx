import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { yearLabel } from '../school-years/schoolYearLabels.js';

// SCR-23 (UC-22, 27/11/2026): the class types of one subject for the chosen school year, grouped by grade, opened
// from "Xem chi tiết" in the "Loại lớp áp dụng" cell. Fixed position so the table's scroll box does not clip it;
// opens above the link when there is no room below. Closes on outside click, Esc, scroll or resize; Esc and ✕ give
// the focus back to the link.
export default function SubjectScopePopover({ anchor, subject, schoolYear, highlightTrackId, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const width = ref.current?.offsetWidth ?? 320;
    const height = ref.current?.offsetHeight ?? 360;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = r.bottom + 4;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 4) : below;
    setPos({ top, left, ready: true });
  }, [anchor]);

  useEffect(() => {
    ref.current?.focus();
    const closeAndFocus = () => {
      onClose();
      anchor.focus();
    };
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closeAndFocus();
    };
    const onScroll = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  // The server sends the types ordered by grade, then name: keep that order inside each grade.
  const groups = [];
  subject.tracks.forEach((t) => {
    const key = t.gradeLevel ?? '';
    let group = groups.find((g) => g.key === key);
    if (!group) groups.push((group = { key, tracks: [] }));
    group.tracks.push(t);
  });
  groups.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : Number(a.key) - Number(b.key)));

  const tracksHref = `/class-tracks${schoolYear ? `?schoolYearId=${schoolYear.schoolYearId}` : ''}`;
  const titleId = `subject-scope-title-${subject.subjectId}`;

  return (
    <div
      ref={ref}
      className="subject-scope-pop"
      style={{ top: pos.top, left: pos.left, visibility: pos.ready ? 'visible' : 'hidden' }}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      // The row behind opens SCR-24 on click: nothing inside the pop-up may reach it.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="subject-scope-head">
        <div>
          <div id={titleId} className="subject-scope-title">
            {subject.subjectName}
          </div>
          {schoolYear && <div className="caption muted">Năm học {yearLabel(schoolYear.yearName)}</div>}
        </div>
        <button
          type="button"
          className="btn btn-icon subject-scope-close"
          aria-label="Đóng"
          onClick={() => {
            onClose();
            anchor.focus();
          }}
        >
          <Icon name="close" size="sm" />
        </button>
      </div>
      <div className="subject-scope-body">
        {groups.map((g) => (
          <section key={g.key} className="subject-scope-group">
            <h3 className="subject-scope-grade">{g.key ? `Khối ${g.key}` : 'Khác'}</h3>
            <ul>
              {g.tracks.map((t) => (
                <li
                  key={t.trackId}
                  className={String(t.trackId) === highlightTrackId ? 'is-current' : undefined}
                  aria-current={String(t.trackId) === highlightTrackId ? 'true' : undefined}
                >
                  <span>{t.trackName}</span>
                  <span className="subject-scope-periods">{t.periodsPerWeek} tiết</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="subject-scope-foot">
        <Link to={tracksHref} className="subject-scope-link">
          Sửa số tiết tại “Loại lớp & số tiết”
          <Icon name="arrow_forward" size="sm" />
        </Link>
      </div>
    </div>
  );
}
