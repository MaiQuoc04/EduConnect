import { fmtResult, fmtScore, isCommentBook, RESULT_LONG, slotLabel, validResult, validScore } from './gradeFormat.js';

// The grade book grid (SCR-44, read only in SCR-68): one row per student, one column per score slot, then the
// semester average. `edits` = { "enrollmentId:componentId:attempt": text } typed but not saved yet.
// A book of a subject assessed by comments (assessmentType COMMENT, 27/11/2026) has a Đ / CĐ choice in each cell and
// the semester result (Đạt / Chưa đạt) instead of the average.
export const cellKey = (enrollmentId, componentId, attemptNo) => `${enrollmentId}:${componentId}:${attemptNo}`;

export default function GradeBookTable({ book, edits = {}, onEdit, editable }) {
  const { components, students } = book;
  const comment = isCommentBook(book);
  const entryOf = (student, componentId, attemptNo) =>
    student.scores.find((s) => String(s.componentId) === String(componentId) && s.attemptNo === attemptNo);
  // The saved value of a cell as shown in the grid: "8,5" or "Đ" / "CĐ".
  const savedText = (student, componentId, attemptNo) => {
    const entry = entryOf(student, componentId, attemptNo);
    return comment ? fmtResult(entry?.result) : fmtScore(entry?.score ?? null);
  };
  const valid = comment ? validResult : validScore;

  return (
    <div className="book-scroll">
      <table className="book-table">
        <thead>
          <tr>
            <th className="sticky no" rowSpan={2}>
              STT
            </th>
            <th className="sticky name" rowSpan={2} style={{ textAlign: 'left' }}>
              Học sinh
            </th>
            {components.map((c) => (
              // A component with one score spans both header rows; one with several gets "Lần 1".."Lần n" below it.
              <th key={c.componentId} colSpan={c.scoreCount} rowSpan={c.scoreCount > 1 ? 1 : 2} className="group-start">
                {c.name} {!comment && <span className="muted">(hệ số {fmtScore(c.weight)})</span>}
              </th>
            ))}
            <th rowSpan={2} className="group-start">
              {comment ? 'Kết quả học kỳ' : 'ĐTB học kỳ'}
            </th>
          </tr>
          <tr className="sub">
            {components.flatMap((c) =>
              c.scoreCount > 1
                ? Array.from({ length: c.scoreCount }, (_, i) => (
                    <th key={`${c.componentId}-${i}`} className={i === 0 ? 'group-start' : undefined}>
                      Lần {i + 1}
                    </th>
                  ))
                : [],
            )}
          </tr>
        </thead>
        <tbody>
          {students.map((s, index) => {
            const left = s.status !== 'STUDYING';
            return (
              <tr key={s.enrollmentId} className={left ? 'left' : undefined}>
                <td className="sticky no">{index + 1}</td>
                <td className="sticky name">
                  <div>{s.fullName}</div>
                  <div className="caption muted mono">
                    {s.studentCode}
                    {left && ` · ${s.status === 'TRANSFERRED' ? 'Đã chuyển lớp' : 'Đã nghỉ học'}`}
                    {!left && s.missing > 0 && (
                      <span className="missing-dot"> · thiếu {s.missing} {comment ? 'lần đánh giá' : 'điểm'}</span>
                    )}
                  </div>
                </td>
                {components.flatMap((c) =>
                  Array.from({ length: c.scoreCount }, (_, i) => {
                    const attempt = i + 1;
                    const key = cellKey(s.enrollmentId, c.componentId, attempt);
                    const saved = savedText(s, c.componentId, attempt);
                    const typed = edits[key];
                    const shown = typed ?? saved;
                    const label = `${s.fullName} – ${slotLabel(c, attempt)}`;
                    const className = `score-input${typed !== undefined ? ' changed' : ''}${valid(shown) ? '' : ' invalid'}`;
                    let cell = <span className="score-value">{saved}</span>;
                    if (editable && !left && comment) {
                      cell = (
                        <select className={className} value={shown} aria-label={label} onChange={(e) => onEdit(key, e.target.value, saved)}>
                          <option value="" />
                          <option value="Đ">Đ</option>
                          <option value="CĐ">CĐ</option>
                        </select>
                      );
                    } else if (editable && !left) {
                      cell = (
                        <input
                          className={className}
                          value={shown}
                          inputMode="decimal"
                          maxLength={5}
                          aria-label={label}
                          onChange={(e) => onEdit(key, e.target.value, saved)}
                        />
                      );
                    }
                    return (
                      <td key={key} className={`score${i === 0 ? ' group-start' : ''}`}>
                        {cell}
                      </td>
                    );
                  }),
                )}
                <td className="avg group-start">{comment ? (RESULT_LONG[s.result] ?? '') : fmtScore(s.average)}</td>
              </tr>
            );
          })}
          {!students.length && (
            <tr>
              <td colSpan={3 + components.reduce((n, c) => n + c.scoreCount, 0)} className="muted" style={{ textAlign: 'center' }}>
                Lớp chưa có học sinh.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
