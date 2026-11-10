// Semester picker grouped by school year (FE-11). `semesters` from useGradeOptions().
export default function SemesterSelect({ id = 'semester', semesters, value, onChange, label = 'Học kỳ' }) {
  const years = [...new Map(semesters.map((s) => [s.schoolYearId, s.yearName])).entries()];
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {years.map(([yearId, yearName]) => (
          <optgroup key={yearId} label={`Năm học ${yearName}`}>
            {semesters
              .filter((s) => s.schoolYearId === yearId)
              .map((s) => (
                <option key={s.semesterId} value={s.semesterId}>
                  Học kỳ {s.semesterNo} – {yearName}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
