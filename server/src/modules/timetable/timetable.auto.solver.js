// FE-10 automatic scheduling (Dung, 17/11/2026) – the solver. Pure functions, no database: the service loads the data,
// calls assignTeachers() (step A) and/or solveTimetable() (step B), and saves the draft only when the School Manager
// applies it. Spec: docs/business-rules.md §10 "Automatic scheduling".
//
// Step A – teaching assignment: greedy with balancing (fewest qualified teachers first, then the teacher with the most
//   room under their norm), then pairwise improvement. Hard: H1 qualified, H2 one teacher per (class, subject),
//   H3 weekly cap; the subject of the fixed slots (Chào cờ, Sinh hoạt lớp) gets a different teacher in every class
//   (the fixed slots are at the same time in every class) and never a teacher busy at a fixed slot.
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
  // Teachers busy at a fixed slot (a lesson of a class outside this run, or a cell marked busy) cannot take the
  // fixed-slot subject: its lessons are pinned to those cells in every class (25/11/2026, 12D1 / 10A1 case).
  const fixedCells = fixedSubject ? o.fixed.slots.map((f) => cellKey(f.weekday, f.period)) : [];
  const busyAtFixed = new Set(teachers
    .filter((t) => (t.busy ?? []).some((k) => fixedCells.includes(k)))
    .map((t) => String(t.teacherId)));
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
      (t) => load.get(String(t.teacherId)) + p.counted <= capOf(t)
        && !(isFixed && (fixedTaken.has(String(t.teacherId)) || busyAtFixed.has(String(t.teacherId)))),
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

// ── Step B: timetable ───────────────────────────────────────────────────────
// input: days [{ weekday, periods: [1..] }] (the week grid), classes [{ classId, subjects: [{ subjectId, periods }] }],
//        assignments { 'class:subject': teacherId }, teachers [{ teacherId, busy: ['w-p'] }] (busy = other classes'
//        lessons + cells marked busy), options { maxPerDay, maxPerSubjectDay, rooms { subjectId: n }, heavy [ids],
//        afternoon [ids], fixed { subjectId, slots [{ weekday, period }] }, weights, seed, timeLimitMs }
// output: { entries { classId: [{ weekday, period, subjectId, teacherId }] }, unplaced [{ classId, subjectId, count,
//          reason }], violations [{ code, weight, classId?, teacherId?, subjectId?, weekday, period? }], score }
export function solveTimetable({ days, classes, assignments, teachers, options }) {
  const o = {
    maxPerDay: 4,
    maxPerSubjectDay: 2,
    rooms: {},
    heavy: [],
    afternoon: [],
    timeLimitMs: 4000,
    ...options,
    weights: { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) },
  };
  const W = o.weights;
  const random = rng(o.seed ?? 1);
  const heavy = new Set(o.heavy.map(String));
  const afternoon = new Set(o.afternoon.map(String));
  const rooms = new Map(Object.entries(o.rooms ?? {}).filter(([, n]) => n != null && n !== '').map(([k, n]) => [String(k), Number(n)]));
  const cells = [];
  for (const d of days) for (const p of d.periods) cells.push({ w: d.weekday, p, k: cellKey(d.weekday, p) });
  const cellSet = new Set(cells.map((c) => c.k));
  const dayPeriods = new Map(days.map((d) => [d.weekday, [...d.periods].sort((a, b) => a - b)]));

  // Lessons: one per period to place. Fixed-slot lessons first, pinned.
  const lessons = [];
  const unplaced = [];
  const fixedSubject = o.fixed?.slots?.length ? String(o.fixed.subjectId) : null;
  for (const c of classes) {
    for (const s of c.subjects) {
      const teacherId = assignments[pairKey(c.classId, s.subjectId)];
      if (teacherId == null) {
        unplaced.push({ classId: c.classId, subjectId: s.subjectId, count: s.periods, reason: 'NO_TEACHER' });
        continue;
      }
      let left = s.periods;
      if (fixedSubject && String(s.subjectId) === fixedSubject) {
        for (const f of o.fixed.slots) {
          if (!left) break;
          lessons.push({ classId: String(c.classId), subjectId: String(s.subjectId), teacherId: String(teacherId), fixed: cellKey(f.weekday, f.period) });
          left -= 1;
        }
      }
      for (let i = 0; i < left; i += 1) {
        lessons.push({ classId: String(c.classId), subjectId: String(s.subjectId), teacherId: String(teacherId), fixed: null });
      }
    }
  }

  // State
  const at = new Array(lessons.length).fill(null); // lesson -> cell key
  const classAt = new Map(); // `${class}|${cell}` -> lesson
  const teacherAt = new Map(); // `${teacher}|${cell}` -> lesson (-1 = busy outside this run)
  const roomUse = new Map(); // `${subject}|${cell}` -> count
  const daySubj = new Map(); // `${class}|${subject}|${w}` -> count
  for (const t of teachers) for (const b of t.busy ?? []) teacherAt.set(`${t.teacherId}|${b}`, -1);
  const teacherLessons = new Map();
  lessons.forEach((l, i) => {
    if (!teacherLessons.has(l.teacherId)) teacherLessons.set(l.teacherId, []);
    teacherLessons.get(l.teacherId).push(i);
  });
  const classLessons = new Map();
  lessons.forEach((l, i) => {
    if (!classLessons.has(l.classId)) classLessons.set(l.classId, []);
    classLessons.get(l.classId).push(i);
  });
  const wOf = (k) => Number(k.split('-')[0]);
  const pOf = (k) => Number(k.split('-')[1]);
  const inc = (m, k, d) => m.set(k, (m.get(k) ?? 0) + d);

  function canPlace(i, k, ignore) {
    const l = lessons[i];
    if (!cellSet.has(k) && !(l.fixed === k)) return false;
    const ca = classAt.get(`${l.classId}|${k}`);
    if (ca != null && !ignore?.has(ca)) return false;
    const ta = teacherAt.get(`${l.teacherId}|${k}`);
    if (ta != null && (ta === -1 || !ignore?.has(ta))) return false;
    const cap = rooms.get(l.subjectId);
    if (cap != null) {
      let used = roomUse.get(`${l.subjectId}|${k}`) ?? 0;
      if (ignore) for (const j of ignore) if (at[j] === k && lessons[j].subjectId === l.subjectId) used -= 1;
      if (used >= cap) return false;
    }
    let same = daySubj.get(`${l.classId}|${l.subjectId}|${wOf(k)}`) ?? 0;
    if (ignore) for (const j of ignore) if (at[j] != null && wOf(at[j]) === wOf(k) && lessons[j].classId === l.classId && lessons[j].subjectId === l.subjectId) same -= 1;
    if (same >= o.maxPerSubjectDay) return false;
    return true;
  }
  function put(i, k) {
    const l = lessons[i];
    at[i] = k;
    classAt.set(`${l.classId}|${k}`, i);
    teacherAt.set(`${l.teacherId}|${k}`, i);
    inc(roomUse, `${l.subjectId}|${k}`, 1);
    inc(daySubj, `${l.classId}|${l.subjectId}|${wOf(k)}`, 1);
  }
  function take(i) {
    const l = lessons[i];
    const k = at[i];
    if (k == null) return;
    classAt.delete(`${l.classId}|${k}`);
    teacherAt.delete(`${l.teacherId}|${k}`);
    inc(roomUse, `${l.subjectId}|${k}`, -1);
    inc(daySubj, `${l.classId}|${l.subjectId}|${wOf(k)}`, -1);
    at[i] = null;
  }

  // ── Penalties, cached per class-day, teacher-day and class-subject ──
  function classDayCost(classId, w) {
    const ps = dayPeriods.get(w) ?? [];
    let cost = 0;
    const bySubj = new Map();
    for (const s of [0, 1]) {
      const inSession = ps.filter((p) => session(p) === s);
      let seenEmpty = false;
      for (const p of inSession) {
        const li = classAt.get(`${classId}|${cellKey(w, p)}`);
        if (li == null) { seenEmpty = true; continue; }
        if (seenEmpty) cost += W.GAP;
        const l = lessons[li];
        if (!bySubj.has(l.subjectId)) bySubj.set(l.subjectId, []);
        bySubj.get(l.subjectId).push(p);
        if (heavy.has(l.subjectId) && (p >= 4)) cost += W.S6;
        if (afternoon.has(l.subjectId) && session(p) === 0 && !l.fixed) cost += W.S7;
      }
    }
    for (const [, list] of bySubj) {
      if (list.length >= 2) {
        list.sort((a, b) => a - b);
        for (let j = 1; j < list.length; j += 1) {
          if (list[j] - list[j - 1] !== 1 || session(list[j]) !== session(list[j - 1])) cost += W.S3;
        }
      }
    }
    return cost;
  }
  function teacherDayCost(teacherId, w) {
    const ps = dayPeriods.get(w) ?? [];
    let cost = 0;
    let count = 0;
    for (const s of [0, 1]) {
      const teach = ps.filter((p) => session(p) === s && teacherAt.get(`${teacherId}|${cellKey(w, p)}`) != null
        && teacherAt.get(`${teacherId}|${cellKey(w, p)}`) !== -1);
      count += teach.length;
      if (teach.length >= 2) {
        const span = ps.filter((p) => session(p) === s && p >= teach[0] && p <= teach[teach.length - 1]).length;
        cost += (span - teach.length) * W.S2;
      }
    }
    if (count > o.maxPerDay) cost += (count - o.maxPerDay) * W.S4;
    return cost;
  }
  const spreadCost = (classId, subjectId) => {
    const ids = (classLessons.get(classId) ?? []).filter((i) => lessons[i].subjectId === subjectId && at[i] != null);
    if (ids.length < 2) return 0;
    const daysUsed = new Set(ids.map((i) => wOf(at[i]))).size;
    return daysUsed < 2 ? W.S5 : 0;
  };
  const cache = new Map();
  let total = 0;
  function keysFor(i, k) {
    const l = lessons[i];
    const w = wOf(k);
    return [`c|${l.classId}|${w}`, `t|${l.teacherId}|${w}`, `s|${l.classId}|${l.subjectId}`];
  }
  function evalKey(key) {
    const [kind, a, b] = key.split('|');
    if (kind === 'c') return classDayCost(a, Number(b));
    if (kind === 't') return teacherDayCost(a, Number(b));
    return spreadCost(a, b);
  }
  function refresh(keys) {
    for (const key of new Set(keys)) {
      total -= cache.get(key) ?? 0;
      const v = evalKey(key);
      cache.set(key, v);
      total += v;
    }
  }
  // Cost change of placing lesson i in k (state restored after).
  function placeDelta(i, k) {
    const keys = [...new Set(keysFor(i, k))];
    const before = keys.reduce((s, key) => s + (cache.get(key) ?? evalKey(key)), 0);
    put(i, k);
    const after = keys.reduce((s, key) => s + evalKey(key), 0);
    take(i);
    return after - before;
  }

  // ── Construction ──
  const order = lessons.map((l, i) => i).filter((i) => !lessons[i].fixed);
  const tCount = (i) => teacherLessons.get(lessons[i].teacherId).length;
  const tie = lessons.map(() => random());
  order.sort((a, b) => (rooms.has(lessons[b].subjectId) - rooms.has(lessons[a].subjectId))
    || tCount(b) - tCount(a) || tie[a] - tie[b]);
  const failed = [];
  for (let i = 0; i < lessons.length; i += 1) {
    const l = lessons[i];
    if (!l.fixed) continue;
    if (canPlace(i, l.fixed)) { put(i, l.fixed); refresh(keysFor(i, l.fixed)); } else failed.push({ i, reason: 'FIXED_SLOT' });
  }
  const tryPlace = (i) => {
    let best = null;
    let bestD = Infinity;
    for (const c of cells) {
      if (!canPlace(i, c.k)) continue;
      const d = placeDelta(i, c.k) + random() * 1e-3;
      if (d < bestD) [best, bestD] = [c.k, d];
    }
    if (best) { put(i, best); refresh(keysFor(i, best)); return true; }
    return false;
  };
  // One-step repair: free a cell for i by moving the lesson in the way (same class, or same teacher elsewhere).
  const repair = (i) => {
    const l = lessons[i];
    const shuffled = [...cells].sort(() => random() - 0.5);
    for (const c of shuffled) {
      const blockers = [classAt.get(`${l.classId}|${c.k}`), teacherAt.get(`${l.teacherId}|${c.k}`)]
        .filter((j) => j != null && j !== -1);
      const uniq = [...new Set(blockers)];
      if (!uniq.length || uniq.some((j) => lessons[j].fixed)) continue;
      const ignore = new Set(uniq);
      if (!canPlace(i, c.k, ignore)) continue;
      const old = uniq.map((j) => at[j]);
      uniq.forEach((j) => { const ok = at[j]; take(j); refresh(keysFor(j, ok)); });
      put(i, c.k);
      const moved = [];
      let ok = true;
      for (const j of uniq) {
        const target = cells.find((d) => d.k !== old[uniq.indexOf(j)] && canPlace(j, d.k));
        if (!target) { ok = false; break; }
        put(j, target.k);
        moved.push(j);
      }
      if (ok) {
        refresh([...keysFor(i, c.k), ...uniq.flatMap((j) => keysFor(j, at[j])), ...uniq.flatMap((j, n) => keysFor(j, old[n]))]);
        return true;
      }
      moved.forEach((j) => take(j));
      take(i);
      uniq.forEach((j, n) => put(j, old[n]));
      refresh([...keysFor(i, c.k), ...uniq.flatMap((j, n) => keysFor(j, old[n]))]);
    }
    return false;
  };
  for (const i of order) if (!tryPlace(i) && !repair(i)) failed.push({ i, reason: null });

  // ── Local search: swap two cells of one class (lesson↔lesson or lesson↔empty) ──
  const deadline = Date.now() + Math.max(200, o.timeLimitMs);
  const objective = () => failedOpen().length * 1000 + total;
  const failedOpen = () => failed.filter((f) => at[f.i] == null);
  let best = { at: [...at], obj: objective() };
  let temp = 4;
  const classIds = [...classLessons.keys()];
  let iter = 0;
  let sinceBest = 0;
  // Iteration budget from the time limit: the same data + seed gives the same draft; the clock is only a safety stop
  // on a slow machine.
  const budget = Math.max(2000, Math.round(o.timeLimitMs * 60));
  while (iter < budget && Date.now() < deadline && classIds.length && cells.length > 1) {
    iter += 1;
    if (iter % 500 === 0) {
      if (failedOpen().length) {
        for (const f of failedOpen()) if (!tryPlace(f.i)) repair(f.i);
        const obj = objective();
        if (obj < best.obj) { best = { at: [...at], obj }; sinceBest = 0; }
      }
      temp = Math.max(0.05, temp * 0.97);
    }
    const cid = classIds[Math.floor(random() * classIds.length)];
    const a = cells[Math.floor(random() * cells.length)].k;
    const b = cells[Math.floor(random() * cells.length)].k;
    if (a === b) continue;
    const la = classAt.get(`${cid}|${a}`);
    const lb = classAt.get(`${cid}|${b}`);
    if ((la == null && lb == null) || (la != null && lessons[la].fixed) || (lb != null && lessons[lb].fixed)) continue;
    const moving = [la, lb].filter((x) => x != null);
    const ignore = new Set(moving);
    if (la != null && !canPlace(la, b, ignore)) continue;
    if (lb != null && !canPlace(lb, a, ignore)) continue;
    const keys = [...(la != null ? [...keysFor(la, a), ...keysFor(la, b)] : []), ...(lb != null ? [...keysFor(lb, a), ...keysFor(lb, b)] : [])];
    const before = total;
    moving.forEach((x) => take(x));
    if (la != null) put(la, b);
    if (lb != null) put(lb, a);
    // the day limit of one subject can be broken by a same-subject pair landing on one day: recheck
    const broken = moving.some((x) => (daySubj.get(`${lessons[x].classId}|${lessons[x].subjectId}|${wOf(at[x])}`) ?? 0) > o.maxPerSubjectDay);
    if (broken) {
      moving.forEach((x) => take(x));
      if (la != null) put(la, a);
      if (lb != null) put(lb, b);
      continue;
    }
    refresh(keys);
    const delta = total - before;
    if (delta <= 0 || random() < Math.exp(-delta / temp)) {
      const obj = objective();
      if (obj < best.obj) { best = { at: [...at], obj }; sinceBest = 0; } else sinceBest += 1;
      if (best.obj === 0 || sinceBest > 60000) break;
    } else {
      moving.forEach((x) => take(x));
      if (la != null) put(la, a);
      if (lb != null) put(lb, b);
      refresh(keys);
    }
  }
  // Restore the best state seen.
  for (let i = 0; i < lessons.length; i += 1) take(i);
  best.at.forEach((k, i) => { if (k != null) put(i, k); });
  cache.clear();
  total = 0;
  const allKeys = new Set();
  lessons.forEach((l, i) => { if (at[i] != null) keysFor(i, at[i]).forEach((k) => allKeys.add(k)); });
  refresh([...allKeys]);

  // ── Output ──
  const entries = {};
  for (const c of classes) entries[c.classId] = [];
  lessons.forEach((l, i) => {
    if (at[i] == null) return;
    entries[l.classId].push({ weekday: wOf(at[i]), period: pOf(at[i]), subjectId: l.subjectId, teacherId: l.teacherId, fixed: Boolean(l.fixed) });
  });
  for (const id of Object.keys(entries)) entries[id].sort((x, y) => x.weekday - y.weekday || x.period - y.period);

  // Unplaced lessons, grouped, with the most likely reason.
  const missing = new Map();
  lessons.forEach((l, i) => {
    if (at[i] != null) return;
    const k = pairKey(l.classId, l.subjectId);
    if (!missing.has(k)) missing.set(k, { classId: l.classId, subjectId: l.subjectId, count: 0, reason: reasonOf(i) });
    missing.get(k).count += 1;
  });
  function reasonOf(i) {
    const l = lessons[i];
    if (l.fixed) return 'FIXED_SLOT';
    const free = cells.filter((c) => !classAt.has(`${l.classId}|${c.k}`));
    if (!free.length) return 'CLASS_FULL';
    const teacherFree = free.filter((c) => !teacherAt.has(`${l.teacherId}|${c.k}`));
    if (!teacherFree.length) return 'TEACHER_BUSY';
    const cap = rooms.get(l.subjectId);
    const roomFree = cap == null ? teacherFree : teacherFree.filter((c) => (roomUse.get(`${l.subjectId}|${c.k}`) ?? 0) < cap);
    if (!roomFree.length) return 'ROOM_FULL';
    return 'DAY_LIMIT';
  }
  unplaced.push(...missing.values());

  return { entries, unplaced, violations: listViolations(), score: total, iterations: iter };

  function listViolations() {
    const out = [];
    for (const cid of classLessons.keys()) {
      for (const d of days) {
        const w = d.weekday;
        const ps = dayPeriods.get(w);
        const bySubj = new Map();
        for (const s of [0, 1]) {
          let seenEmpty = false;
          for (const p of ps.filter((x) => session(x) === s)) {
            const li = classAt.get(`${cid}|${cellKey(w, p)}`);
            if (li == null) { seenEmpty = true; continue; }
            const l = lessons[li];
            if (seenEmpty) out.push({ code: 'GAP', weight: W.GAP, classId: cid, weekday: w, period: p });
            if (!bySubj.has(l.subjectId)) bySubj.set(l.subjectId, []);
            bySubj.get(l.subjectId).push(p);
            if (heavy.has(l.subjectId) && p >= 4) out.push({ code: 'S6', weight: W.S6, classId: cid, subjectId: l.subjectId, weekday: w, period: p });
            if (afternoon.has(l.subjectId) && session(p) === 0 && !l.fixed) out.push({ code: 'S7', weight: W.S7, classId: cid, subjectId: l.subjectId, weekday: w, period: p });
          }
        }
        for (const [sid, list] of bySubj) {
          list.sort((a, b) => a - b);
          for (let j = 1; j < list.length; j += 1) {
            if (list[j] - list[j - 1] !== 1 || session(list[j]) !== session(list[j - 1])) {
              out.push({ code: 'S3', weight: W.S3, classId: cid, subjectId: sid, weekday: w, period: list[j] });
            }
          }
        }
      }
      const subjects = new Set(classLessons.get(cid).map((i) => lessons[i].subjectId));
      for (const sid of subjects) if (spreadCost(cid, sid)) out.push({ code: 'S5', weight: W.S5, classId: cid, subjectId: sid });
    }
    for (const tid of teacherLessons.keys()) {
      for (const d of days) {
        const v = teacherDayCost(tid, d.weekday);
        if (!v) continue;
        const ps = dayPeriods.get(d.weekday);
        let count = 0;
        for (const s of [0, 1]) {
          const teach = ps.filter((p) => session(p) === s && teacherAt.get(`${tid}|${cellKey(d.weekday, p)}`) >= 0);
          count += teach.length;
          if (teach.length >= 2) {
            const gaps = ps.filter((p) => session(p) === s && p > teach[0] && p < teach[teach.length - 1] && !teach.includes(p)).length;
            if (gaps) out.push({ code: 'S2', weight: W.S2 * gaps, teacherId: tid, weekday: d.weekday, count: gaps });
          }
        }
        if (count > o.maxPerDay) out.push({ code: 'S4', weight: (count - o.maxPerDay) * W.S4, teacherId: tid, weekday: d.weekday, count });
      }
    }
    return out.sort((a, b) => b.weight - a.weight);
  }
}
