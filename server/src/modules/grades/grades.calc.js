// FE-11 Grade Management (owner: Linh) – grade calculations (business-rules §11). Pure functions, no database:
// unit tested in grades.calc.test.js (Report 2: grade calculation and locking need unit tests).
//
// Weights are per-score coefficients, as in Circular 22 (regular tests ×1, mid-term ×2, final ×3), not percentages:
// a semester average is Σ(score × weight of its component) / Σ(weight), over the scores present (FE-11 owner,
// 10/11/2026). Averages are never stored; they are computed here each time they are shown.

// A score from the database (NUMERIC arrives as a string) or from a form, as a number; null when empty.
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ASSUMPTION (FE-11 owner, 10/11/2026, to confirm with the team lead): averages are shown with 1 decimal, rounded
// half up (Circular 22). Ranking compares the unrounded values.
export const AVERAGE_DECIMALS = 1;

export function roundScore(value, decimals = AVERAGE_DECIMALS) {
  if (value === null || value === undefined) return null;
  const factor = 10 ** decimals;
  // toPrecision removes binary noise first: 7.85 * 10 = 78.49999999999999 would otherwise round down.
  return Math.round(Number((value * factor).toPrecision(12))) / factor;
}

/**
 * Subject semester average: weighted average of the scores present.
 * @param {{componentId:number|string, weight:number|string}[]} components the subject's structure for the semester
 * @param {{componentId:number|string, score:number|string|null}[]} scores one student's scores (any attempts)
 * @returns {number|null} unrounded average, or null when the student has no score yet
 */
export function semesterAverage(components, scores) {
  const weights = new Map(components.map((c) => [String(c.componentId), toNumber(c.weight)]));
  let sum = 0;
  let weightSum = 0;
  for (const s of scores) {
    const score = toNumber(s.score);
    const weight = weights.get(String(s.componentId));
    if (score === null || !weight) continue; // cleared score, or a component not in this structure
    sum += score * weight;
    weightSum += weight;
  }
  return weightSum ? sum / weightSum : null;
}

/** Subject year average = (S1 + 2 × S2) / 3; null unless both semesters have an average. */
export function yearAverage(semester1, semester2) {
  const s1 = toNumber(semester1);
  const s2 = toNumber(semester2);
  return s1 === null || s2 === null ? null : (s1 + 2 * s2) / 3;
}

/**
 * Student overall average = plain average of the subject averages present (every class-type subject weight is 1).
 * Used for the year (business-rules §11) and, ASSUMPTION (FE-11 owner, 10/11/2026), for one semester too.
 */
export function overallAverage(subjectAverages) {
  const values = subjectAverages.map(toNumber).filter((v) => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// Compares averages without binary noise (two students with the same scores must tie).
const sameScore = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * Class ranking, highest average first. Equal averages share a rank and the next rank is skipped (1, 2, 2, 4).
 * Students without an average are not ranked (rank null) and are listed last.
 * @param {{id:any, average:number|null}[]} students
 * @returns {{id:any, average:number|null, rank:number|null}[]} sorted; `ranked` = how many have a rank
 */
export function rankStudents(students) {
  const withAverage = students.filter((s) => s.average !== null && s.average !== undefined);
  const without = students.filter((s) => s.average === null || s.average === undefined);
  const sorted = [...withAverage].sort((a, b) => b.average - a.average);
  let previous = null;
  const ranked = sorted.map((s, i) => {
    const rank = previous && sameScore(previous.average, s.average) ? previous.rank : i + 1;
    previous = { average: s.average, rank };
    return { ...s, rank };
  });
  return [...ranked, ...without.map((s) => ({ ...s, rank: null }))];
}

/**
 * Score slots a student still lacks before the grade book can be finalized (UC-85).
 * ASSUMPTION (FE-11 owner, 10/11/2026, to confirm): "missing a score" = any attempt of any component is empty
 * (e.g. 4 regular tests, 1 mid-term and 1 final are all needed).
 * @returns {{componentId, attemptNo}[]}
 */
export function missingSlots(components, scores) {
  const present = new Set(
    scores.filter((s) => toNumber(s.score) !== null).map((s) => `${s.componentId}:${s.attemptNo}`),
  );
  const missing = [];
  for (const c of components) {
    for (let attempt = 1; attempt <= Number(c.scoreCount); attempt += 1) {
      if (!present.has(`${c.componentId}:${attempt}`)) missing.push({ componentId: c.componentId, attemptNo: attempt });
    }
  }
  return missing;
}

/**
 * Reads a score typed by a user ("8", "8.5", "8,5", 8.25) for UC-83 / UC-84.
 * @returns {{ok:true, value:number|null} | {ok:false}} value null = empty (clear in UC-83, keep in UC-84)
 */
export function parseScore(input) {
  if (input === null || input === undefined) return { ok: true, value: null };
  const text = String(input).trim().replace(',', '.');
  if (text === '') return { ok: true, value: null };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return { ok: false };
  const value = Number(text);
  return value >= 0 && value <= 10 ? { ok: true, value } : { ok: false };
}
