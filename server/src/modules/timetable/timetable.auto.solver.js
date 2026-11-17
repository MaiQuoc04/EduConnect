// FE-10 automatic scheduling (Dung, 17/11/2026) – the solver. Pure functions, no database: the service loads the data,
// calls assignTeachers() (step A) and/or solveTimetable() (step B), and saves the draft only when the School Manager
// applies it. Spec: docs/business-rules.md §10 "Automatic scheduling".
//
// Step A – teaching assignment: greedy with balancing (fewest qualified teachers first, then the teacher with the most
//   room under their norm), then pairwise improvement. Hard: H1 qualified, H2 one teacher per (class, subject),
//   H3 weekly cap; the subject of the fixed slots (Chào cờ, Sinh hoạt lớp) gets a different teacher in every class
//   (the fixed slots are at the same time in every class).
// Step B – timetable: a constraint satisfaction problem. Hardest lessons first, each into the free cell that adds the
//   least penalty, a one-step repair (move the lesson in the way) when no cell is free, then local search (swap two
//   cells of a class) until the time limit. Hard (never broken): H4 teacher clash (+ busy cells and the other classes'
//   lessons), H5 one subject per class per cell, H6 exact periods (else reported as unplaced), H7 only the week grid
//   + fixed slots kept, H8 rooms per subject, H9 teacher busy cells, H10 at most N periods of a subject per day.
//   Soft (weighted penalty): S2 teacher gaps, S3 two periods of a subject in a day not adjacent, S4 teacher periods per
//   day, S5 a subject packed into one day, S6 heavy subjects late, S7 afternoon subjects in the morning, GAP empty cell
//   before a lesson in the same session (empty cells go to the end of a session).

export const DEFAULT_WEIGHTS = Object.freeze({ S1: 10, S2: 8, S3: 6, S4: 5, S5: 4, S6: 3, S7: 3, S8: 2, S9: 2, GAP: 20 });
export const MORNING_LAST = 5; // periods 1..5 = morning, 6.. = afternoon (time_slots of the school)

const cellKey = (w, p) => `${w}-${p}`;
const session = (p) => (p <= MORNING_LAST ? 0 : 1);

// Small seeded random generator (mulberry32): the same data + seed gives the same draft.
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pairKey = (classId, subjectId) => `${classId}:${subjectId}`;
const normOf = (t, o) => (t.homeroom ? o.homeroomNorm : o.norm);
// Periods of a (class, subject) that count towards the teacher's norm: the fixed slots (Chào cờ, Sinh hoạt lớp) do not.
export function countedPeriods(subjectId, periods, o) {
  if (!o.fixed || String(o.fixed.subjectId) !== String(subjectId)) return periods;
  return Math.max(0, periods - Math.min(periods, o.fixed.slots.length));
}

// ── Step A: teaching assignment ─────────────────────────────────────────────
// input: classes [{ classId, homeroomTeacherId, subjects: [{ subjectId, periods }] }],
//        teachers [{ teacherId, subjectIds, homeroom, baseLoad }], fixedAssignments { 'class:subject': teacherId },
//        options { norm, homeroomNorm, maxOver, fixed, weights, seed }
// output: { assignments { 'class:subject': teacherId }, unassigned [{ classId, subjectId, reason }], loads { teacherId: n } }
export function assignTeachers({ classes, teachers, fixedAssignments = {}, options }) {
  const o = { ...options, weights: { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) } };
  const W = o.weights;
  const random = rng((o.seed ?? 1) * 7919 + 13);
  const byId = new Map(teachers.map((t) => [String(t.teacherId), t]));
  const load = new Map(teachers.map((t) => [String(t.teacherId), t.baseLoad ?? 0]));
  const fixedSubject = o.fixed?.slots?.length ? String(o.fixed.subjectId) : null;
  const fixedTaken = new Set(); // teachers that already teach the fixed-slot subject somewhere
  const assignments = {};
  const unassigned = [];

  const pairs = [];
  for (const c of classes) {
    for (const s of c.subjects) {
      const k = pairKey(c.classId, s.subjectId);
      const counted = countedPeriods(s.subjectId, s.periods, o);
      if (fixedAssignments[k] != null) {
        const t = String(fixedAssignments[k]);
        assignments[k] = t;
        load.set(t, (load.get(t) ?? 0) + counted);
        if (fixedSubject && String(s.subjectId) === fixedSubject) fixedTaken.add(t);
        continue;
      }
      const qualified = teachers.filter((t) => t.subjectIds.map(String).includes(String(s.subjectId)));
      pairs.push({ k, c, s, counted, qualified, tie: random() });
    }
  }
  pairs.sort((a, b) => a.qualified.length - b.qualified.length || b.counted - a.counted || a.tie - b.tie);

  const capOf = (t) => normOf(t, o) + o.maxOver;
  const pickCost = (t, p) => {
    const id = String(t.teacherId);
    const after = load.get(id) + p.counted;
    let cost = Math.max(0, after - normOf(t, o)) * W.S1 + (after / normOf(t, o)) * W.S8;
    if (String(p.c.homeroomTeacherId) === id) cost -= W.S9 * 2; // homeroom teacher teaches their own class
    return cost;
  };
  for (const p of pairs) {
    if (!p.qualified.length) {
      unassigned.push({ classId: p.c.classId, subjectId: p.s.subjectId, reason: 'NO_QUALIFIED' });
      continue;
    }
    const isFixed = fixedSubject && String(p.s.subjectId) === fixedSubject;
    const fits = p.qualified.filter(
      (t) => load.get(String(t.teacherId)) + p.counted <= capOf(t) && !(isFixed && fixedTaken.has(String(t.teacherId))),
    );
    if (!fits.length) {
      const reason = p.qualified.every((t) => load.get(String(t.teacherId)) + p.counted > capOf(t)) ? 'OVER_CAP' : 'FIXED_CLASH';
      unassigned.push({ classId: p.c.classId, subjectId: p.s.subjectId, reason });
      continue;
    }
    // The fixed-slot subject (HĐTN) goes to the homeroom teacher when they may teach it.
    const home = isFixed && fits.find((t) => String(t.teacherId) === String(p.c.homeroomTeacherId));
    let best = home || null;
    if (!best) {
      let bestCost = Infinity;
      for (const t of fits) {
        const cost = pickCost(t, p) + random() * 1e-6;
        if (cost < bestCost) [best, bestCost] = [t, cost];
      }
    }
    const id = String(best.teacherId);
    assignments[p.k] = id;
    load.set(id, load.get(id) + p.counted);
    if (isFixed) fixedTaken.add(id);
  }

  // Improvement: move a (class, subject) to another qualified teacher when it lowers overload + imbalance.
  const teacherCost = (id, l) => {
    const t = byId.get(id);
    return Math.max(0, l - normOf(t, o)) * W.S1 + ((l / normOf(t, o) - 1) ** 2) * W.S8 * 10;
  };
  const movable = pairs.filter((p) => assignments[p.k] && !(fixedSubject && String(p.s.subjectId) === fixedSubject));
  for (let round = 0; round < 3; round += 1) {
    let improved = false;
    for (const p of movable) {
      const cur = assignments[p.k];
      for (const t of p.qualified) {
        const id = String(t.teacherId);
        if (id === cur || load.get(id) + p.counted > capOf(t)) continue;
        const before = teacherCost(cur, load.get(cur)) + teacherCost(id, load.get(id))
          - (String(p.c.homeroomTeacherId) === cur ? W.S9 : 0);
        const after = teacherCost(cur, load.get(cur) - p.counted) + teacherCost(id, load.get(id) + p.counted)
          - (String(p.c.homeroomTeacherId) === id ? W.S9 : 0);
        if (after < before - 1e-9) {
          load.set(cur, load.get(cur) - p.counted);
          load.set(id, load.get(id) + p.counted);
          assignments[p.k] = id;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }
  return { assignments, unassigned, loads: Object.fromEntries(load) };
}
