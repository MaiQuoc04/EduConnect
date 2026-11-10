import { fmtScore, slotLabel, validScore } from './gradeFormat.js';

// The grade book grid (SCR-44, read only in SCR-68): one row per student, one column per score slot, then the
// semester average. `edits` = { "enrollmentId:componentId:attempt": text } typed but not saved yet.
export const cellKey = (enrollmentId, componentId, attemptNo) => `${enrollmentId}:${componentId}:${attemptNo}`;

export default function GradeBookTable({ book, edits = {}, onEdit, editable }) {
  const { components, students } = book;
  const scoreOf = (student, componentId, attemptNo) =>
    student.scores.find((s) => String(s.componentId) === String(componentId) && s.attemptNo === attemptNo)?.score ?? null;

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
              <th key={c.componentId} colSpan={c.scoreCount} className="group-start">
                {c.name} <span className="muted">(hệ số {fmtScore(c.weight)})</span>
              </th>
            ))}
            <th rowSpan={2} className="group-start">
              ĐTB học kỳ
            </th>
          </tr>
          <tr className="sub">
            {components.flatMap((c) =>
              Array.from({ length: c.scoreCount }, (_, i) => (
                <th key={`${c.componentId}-${i}`} className={i === 0 ? 'group-start' : undefined}>
                  {slotLabel(c, i + 1)}
                </th>
              )),
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
                    {!left && s.missing > 0 && <span className="missing-dot"> · thiếu {s.missing} điểm</span>}
                  </div>
                </td>
                {components.flatMap((c) =>
                  Array.from({ length: c.scoreCount }, (_, i) => {
                    const attempt = i + 1;
                    const key = cellKey(s.enrollmentId, c.componentId, attempt);
                    const saved = scoreOf(s, c.componentId, attempt);
                    const typed = edits[key];
                    const shown = typed ?? fmtScore(saved);
                    return (
                      <td key={key} className={`score${i === 0 ? ' group-start' : ''}`}>
                        {editable && !left ? (
                          <input
                            className={`score-input${typed !== undefined ? ' changed' : ''}${validScore(shown) ? '' : ' invalid'}`}
                            value={shown}
                            inputMode="decimal"
                            maxLength={5}
                            aria-label={`${s.fullName} – ${slotLabel(c, attempt)}`}
                            onChange={(e) => onEdit(key, e.target.value, fmtScore(saved))}
                          />
                        ) : (
                          <span className="score-value">{fmtScore(saved)}</span>
                        )}
                      </td>
                    );
                  }),
                )}
                <td className="avg group-start">{fmtScore(s.average)}</td>
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
