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

// Circular 22/2021/TT-BGDĐT: every average is rounded to 1 decimal, half up (second decimal 0–4 down, 5–9 up:
// 7,94 → 7,9; 7,95 → 8,0; 6,48 → 6,5). Each step uses the ROUNDED results of the step before (FE-11 owner,
// 14/11/2026): subject semester average → subject year average = (HK1 + 2 × HK2) / 3. The academic level
// (academicLevel) is decided on these rounded subject averages.
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

// Academic result levels of Circular 22/2021/TT-BGDĐT, Article 9 (FE-11 owner, 23/11/2026, supervisor's request):
// there is no overall average of the subjects any more and students are not compared with each other (Article 4.4),
// so no ranking either. A student's period result is one of these levels, from the rounded averages of the subjects:
export const LEVELS = ['GOOD', 'FAIR', 'PASS', 'FAIL']; // Tốt, Khá, Đạt, Chưa đạt

/**
 * Level of one student for one period (a semester, or the year with the subject year averages).
 *   GOOD (Tốt):      every subject ≥ 6.5 and at least 6 subjects ≥ 8.0
 *   FAIR (Khá):      every subject ≥ 5.0 and at least 6 subjects ≥ 6.5
 *   PASS (Đạt):      at least 6 subjects ≥ 5.0 and no subject below 3.5
 *   FAIL (Chưa đạt): otherwise
 * ASSUMPTION (FE-11 owner, 23/11/2026): every subject of the class type is a scored subject – the schema does not mark
 * the subjects assessed by comments (Đạt / Chưa đạt) yet; when they are, they add "every comment subject Đạt" (Tốt,
 * Khá) and "at most one Chưa đạt" (Đạt). ASSUMPTION: with fewer than 6 subjects, "at least 6" means "all of them".
 * @param {(number|string|null)[]} subjectAverages rounded averages of every subject the student studies in the period
 * @returns {'GOOD'|'FAIR'|'PASS'|'FAIL'|null} null while a subject has no average yet (or there is no subject)
 */
export function academicLevel(subjectAverages) {
  const values = subjectAverages.map(toNumber);
  if (!values.length || values.some((v) => v === null)) return null;
  const need = Math.min(6, values.length);
  const atLeast = (min) => values.filter((v) => v >= min).length;
  const all = (min) => values.every((v) => v >= min);
  if (all(6.5) && atLeast(8) >= need) return 'GOOD';
  if (all(5) && atLeast(6.5) >= need) return 'FAIR';
  if (atLeast(5) >= need && all(3.5)) return 'PASS';
  return 'FAIL';
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
