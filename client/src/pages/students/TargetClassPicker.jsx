import { useEffect, useState } from 'react';
import { getPromoteOptions } from '../../api/students.js';
import Icon from '../../components/Icon.jsx';

// Class field of SCR-11 Student Transfer & Promotion: the target class of UC-10 (one student, current school year)
// and the source / target classes of UC-11.
//
// The classes come from GET /students/promote/options (every class of the year that is not soft-deleted, with its
// current size, empty classes included).
// TODO FE-04 (Khanh): switch to GET /classes?schoolYearId= once it exists (getPromoteOptions is temporary).
//
// Either pass `options` (classes already loaded by the page, shape of the options endpoint) or `schoolYearId`
// (the picker loads that year's classes itself).
// value: { classId, className } or null. include(option) -> false leaves an option out of the list (e.g. another
// grade level); describe(option) -> { disabled, note } shows an option but marks it as not selectable.
export default function TargetClassPicker({
  id,
  schoolYearId,
  options: givenOptions,
  value,
  onChange,
  include,
  describe,
  disabled,
  error,
  help,
  label = 'Lớp tiếp nhận mới',
}) {
  const [loaded, setLoaded] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const external = givenOptions !== undefined;

  useEffect(() => {
    if (external || !schoolYearId) return undefined;
    const controller = new AbortController();
    setLoaded(null);
    setLoadError(false);
    getPromoteOptions({ toSchoolYearId: schoolYearId }, { signal: controller.signal })
      .then((data) => setLoaded(data.classes))
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [external, schoolYearId, attempt]);

  const options = external ? givenOptions : loaded;
  const described = (options ?? [])
    .map((c) => ({ id: c.classId, name: c.className, gradeLevelName: c.gradeLevelName, studentCount: c.studentCount }))
    .filter((o) => include?.(o) ?? true)
    .map((o) => ({ ...o, ...(describe?.(o) ?? {}) }));
  // Grouped by grade level like the Student List filter.
  const groups = [...new Set(described.map((o) => o.gradeLevelName))].map((grade) => ({
    grade,
    items: described.filter((o) => o.gradeLevelName === grade),
  }));
  const describedBy = `${id}-msg`;

  function chooseOption(e) {
    const option = described.find((o) => String(o.id) === e.target.value);
    onChange(option ? { classId: option.id, className: option.name, gradeLevelName: option.gradeLevelName } : null);
  }

  let placeholder = 'Chọn lớp';
  if (!options) placeholder = loadError ? 'Không tải được danh sách lớp' : 'Đang tải danh sách lớp…';
  else if (!described.length) placeholder = 'Không có lớp phù hợp';

  return (
    <div className={`field transfer-student-picker${error ? ' invalid' : ''}`}>
      <label className="field-label" htmlFor={id}>
        <span>
          {label} <span className="transfer-student-required">*</span>
        </span>
      </label>
      <div className="input-wrap">
        <select
          id={id}
          className="input transfer-student-select"
          value={value?.classId ?? ''}
          onChange={chooseOption}
          disabled={disabled || !options}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        >
          <option value="">{placeholder}</option>
          {groups.map((g) => (
            <optgroup key={g.grade ?? '-'} label={`Khối ${g.grade ?? '–'}`}>
              {g.items.map((o) => (
                <option key={o.id} value={o.id} disabled={o.disabled}>
                  {o.name} · {o.studentCount} học sinh{o.note ? ` (${o.note})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Icon name="unfold_more" size="sm" className="transfer-student-select-icon" />
      </div>
      {error ? (
        <span id={describedBy} className="field-error" role="alert">
          {error}
        </span>
      ) : (
        <span id={describedBy} className="field-help">
          {help}
        </span>
      )}
      {loadError && !external && (
        <div className="transfer-student-picker-tools">
          <button type="button" className="link-button" onClick={() => setAttempt((n) => n + 1)} disabled={disabled}>
            Tải lại danh sách lớp
          </button>
        </div>
      )}
    </div>
  );
}
