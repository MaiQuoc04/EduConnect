// School year as returned to the client: { id, name, startDate, endDate, isCurrent }.

export function currentYearId(years) {
  // years are sorted newest first; MOM-05: current = latest year that has started
  return years.find((y) => y.started)?.id ?? null;
}

export function toSchoolYear(year, currentId) {
  if (!year) return null;
  const { started, ...rest } = year;
  return { ...rest, isCurrent: String(year.id) === String(currentId) };
}

export function toSchoolYearList(years, currentId) {
  return years.map((y) => toSchoolYear(y, currentId));
}
