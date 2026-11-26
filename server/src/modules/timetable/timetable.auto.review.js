// FE-10 automatic scheduling – review of a draft edited by hand (Dung, 21/11/2026). After a run the School Manager can
// move lessons, put another subject in a cell or change the teacher of a class and subject before "Áp dụng"; every
// change is checked here against the same rules as the solver and the apply step (business rules §10):
//   errors (block "Áp dụng", same set as checkDraft() in timetable.auto.js):
//     teacher not qualified / locked, no teacher for a class and subject, weekly cap (school setting "Số tiết giáo viên dạy tối đa / tuần"), the
//     fixed-slot subject taught by the same teacher in two classes, a cell outside the week grid, two lessons in one
//     cell of a class, a subject the class does not learn, too many periods of a subject in one day, a teacher marked
//     busy, a teacher teaching another class at that time (other classes of the run or classes outside the run),
//     rooms of a subject, periods of a subject not exactly those of the class type, a fixed slot (Chào cờ, Sinh hoạt
//     lớp) moved;
//   warnings (soft rules, with the weights of the screen): S2 teacher gaps, S3 two periods of a
//     subject in a day not adjacent, S5 a subject packed into one day, S6 heavy subject late,
//     S7 afternoon subject in the morning, S9 homeroom teacher not teaching their class, GAP empty cell before a lesson.
// Pure function: the context is loaded by timetable.auto.js (loadContext).
import { countedPeriods, DEFAULT_WEIGHTS, MORNING_LAST } from './timetable.auto.solver.js';

const pairKey = (classId, subjectId) => `${classId}:${subjectId}`;
const cellKey = (w, p) => `${w}-${p}`;
const sessionOf = (p) => (p <= MORNING_LAST ? 0 : 1);

export function gridCells(grid) {
  const cells = new Set();
  for (const d of grid) {
    for (let p = 1; p <= d.morning; p += 1) cells.add(cellKey(d.weekday, p));
    for (let p = 1; p <= d.afternoon; p += 1) cells.add(cellKey(d.weekday, MORNING_LAST + p));
  }
  return cells;
}

export function reviewDraft(cfg, ctx, draft) {
  const errors = [];
  const warnings = [];
  const W = { ...DEFAULT_WEIGHTS, ...(cfg.weights ?? {}) };
  const classById = new Map(ctx.classes.map((c) => [c.classId, c]));
  const teacherById = new Map(ctx.teachers.map((t) => [t.teacherId, t]));
  const fixedSubject = cfg.fixed?.slots?.length ? cfg.fixed.subjectId : null;
  const fixedCells = new Set((cfg.fixed?.slots ?? []).map((f) => cellKey(f.weekday, f.period)));

  // ── assignments ──
  const assign = new Map();
  if (cfg.mode === 'TIMETABLE') {
    for (const [k, t] of ctx.current) assign.set(k, t);
  } else {
    for (const a of draft.assignments) {
      const c = classById.get(a.classId);
      if (!c || !c.subjects.some((s) => s.subjectId === a.subjectId)) {
        errors.push({ code: 'SUBJECT_NOT_IN_CLASS', classId: a.classId, subjectId: a.subjectId });
        continue;
      }
      const t = teacherById.get(a.teacherId);
      if (!t) errors.push({ code: 'TEACHER_UNKNOWN', classId: a.classId, subjectId: a.subjectId });
      else if (t.status !== 'ACTIVE') errors.push({ code: 'TEACHER_LOCKED', classId: a.classId, subjectId: a.subjectId, teacherId: a.teacherId });
      else if (!t.subjectIds.includes(a.subjectId)) errors.push({ code: 'NOT_QUALIFIED', classId: a.classId, subjectId: a.subjectId, teacherId: a.teacherId });
      assign.set(pairKey(a.classId, a.subjectId), a.teacherId);
    }
  }
  for (const c of ctx.classes) {
    for (const s of c.subjects) {
      if (!assign.has(pairKey(c.classId, s.subjectId))) errors.push({ code: 'NO_TEACHER', classId: c.classId, subjectId: s.subjectId });
    }
  }

  // Weekly load: other classes (baseLoad) + this draft; Chào cờ / Sinh hoạt lớp do not count.
  const load = new Map(ctx.teachers.map((t) => [t.teacherId, t.baseLoad]));
  const fixedBy = new Map();
  for (const c of ctx.classes) {
    for (const s of c.subjects) {
      const t = assign.get(pairKey(c.classId, s.subjectId));
      if (!t) continue;
      load.set(t, (load.get(t) ?? 0) + countedPeriods(s.subjectId, s.periods, cfg));
      if (cfg.mode !== 'TIMETABLE' && fixedSubject && s.subjectId === fixedSubject) {
        if (fixedBy.has(t)) errors.push({ code: 'FIXED_SAME_TEACHER', teacherId: t, classIds: [fixedBy.get(t), c.classId], subjectId: s.subjectId });
        else fixedBy.set(t, c.classId);
      }
    }
  }
  const used = new Set(assign.values());
  const loads = ctx.teachers
    .filter((t) => used.has(t.teacherId))
    .map((t) => ({ teacherId: t.teacherId, name: t.name, homeroom: t.homeroom, cap: cfg.teacherMaxWeek, base: t.baseLoad, load: load.get(t.teacherId) ?? 0 }))
    .sort((x, y) => y.load - x.load || x.name.localeCompare(y.name, 'vi'));
  for (const l of loads) {
    if (cfg.mode !== 'TIMETABLE' && l.load > l.cap) errors.push({ code: 'OVER_CAP', teacherId: l.teacherId, load: l.load, cap: l.cap });
  }
  // S9: the homeroom teacher teaches nothing in their class.
  for (const c of ctx.classes) {
    if (!c.homeroomTeacherId) continue;
    const teaches = c.subjects.some((s) => assign.get(pairKey(c.classId, s.subjectId)) === c.homeroomTeacherId);
    if (!teaches) warnings.push({ code: 'S9', weight: W.S9, classId: c.classId, teacherId: c.homeroomTeacherId });
  }

  if (cfg.mode === 'ASSIGN') return finish({ errors, warnings, loads });

  // ── timetables ──
  const grid = gridCells(cfg.grid);
  const slotPeriods = new Set(ctx.slots.map((s) => s.period));
  const days = [...new Set(cfg.grid.filter((d) => d.morning + d.afternoon > 0).map((d) => d.weekday))].sort((a, b) => a - b);
  const heavy = new Set(cfg.heavySubjectIds ?? []);
  const afternoonFirst = new Set(cfg.afternoonSubjectIds ?? []);
  const teacherAt = new Map(); // `${teacherId}|${cell}` -> [classId]
  const roomUse = new Map(); // `${subjectId}|${cell}` -> [classId]
  const teacherCells = new Map(); // teacherId -> Set(cell) inside the run

  for (const c of ctx.classes) {
    const list = draft.timetables[c.classId];
    if (!list) {
      errors.push({ code: 'CLASS_MISSING', classId: c.classId });
      continue;
    }
    const byCell = new Map();
    const perSubject = new Map();
    const perDay = new Map();
    for (const e of list) {
      const cell = cellKey(e.weekday, e.period);
      if (!grid.has(cell) || !slotPeriods.has(e.period)) {
        errors.push({ code: 'OUTSIDE_GRID', classId: c.classId, subjectId: e.subjectId, weekday: e.weekday, period: e.period });
        continue;
      }
      if (byCell.has(cell)) {
        errors.push({ code: 'CLASS_CLASH', classId: c.classId, weekday: e.weekday, period: e.period, subjectIds: [byCell.get(cell), e.subjectId] });
        continue;
      }
      byCell.set(cell, e.subjectId);
      if (!c.subjects.some((s) => s.subjectId === e.subjectId)) {
        errors.push({ code: 'SUBJECT_NOT_IN_CLASS', classId: c.classId, subjectId: e.subjectId, weekday: e.weekday, period: e.period });
        continue;
      }
      perSubject.set(e.subjectId, (perSubject.get(e.subjectId) ?? 0) + 1);
      const dk = `${e.subjectId}|${e.weekday}`;
      perDay.set(dk, [...(perDay.get(dk) ?? []), e.period]);

      const t = assign.get(pairKey(c.classId, e.subjectId));
      if (t) {
        const why = ctx.busyWhy?.get(t)?.get(cell);
        if (why !== undefined) {
          errors.push(why
            ? { code: 'TEACHER_OTHER_CLASS', classId: c.classId, subjectId: e.subjectId, teacherId: t, weekday: e.weekday, period: e.period, other: why }
            : { code: 'TEACHER_MARKED_BUSY', classId: c.classId, subjectId: e.subjectId, teacherId: t, weekday: e.weekday, period: e.period });
        }
        const tk = `${t}|${cell}`;
        teacherAt.set(tk, [...(teacherAt.get(tk) ?? []), c.classId]);
        if (!teacherCells.has(t)) teacherCells.set(t, new Set());
        teacherCells.get(t).add(cell);
      }
      if (cfg.rooms?.[e.subjectId] != null) {
        const rk = `${e.subjectId}|${cell}`;
        roomUse.set(rk, [...(roomUse.get(rk) ?? []), c.classId]);
      }
    }
    for (const [dk, periods] of perDay) {
      const [subjectId, weekday] = dk.split('|');
      if (periods.length > cfg.maxPerSubjectDay) {
        errors.push({ code: 'SUBJECT_DAY_LIMIT', classId: c.classId, subjectId, weekday: Number(weekday), count: periods.length, max: cfg.maxPerSubjectDay });
      }
    }
    for (const s of c.subjects) {
      const placed = perSubject.get(s.subjectId) ?? 0;
      if (placed !== s.periods) errors.push({ code: placed < s.periods ? 'PERIODS_SHORT' : 'PERIODS_OVER', classId: c.classId, subjectId: s.subjectId, placed, need: s.periods });
    }
    if (fixedSubject && c.subjects.some((s) => s.subjectId === fixedSubject)) {
      for (const f of cfg.fixed.slots) {
        if (byCell.get(cellKey(f.weekday, f.period)) !== fixedSubject) {
          errors.push({ code: 'FIXED_SLOT', classId: c.classId, subjectId: fixedSubject, weekday: f.weekday, period: f.period, label: f.label });
        }
      }
    }

    // Soft rules of the class: empty cell before a lesson in a session (GAP), S3, S6, S7 per day; S5 per subject.
    for (const w of days) {
      const ps = [...grid].filter((k) => Number(k.split('-')[0]) === w).map((k) => Number(k.split('-')[1])).sort((a, b) => a - b);
      for (const sess of [0, 1]) {
        let seenEmpty = false;
        for (const p of ps.filter((x) => sessionOf(x) === sess)) {
          const sid = byCell.get(cellKey(w, p));
          if (sid == null) { seenEmpty = true; continue; }
          if (seenEmpty) warnings.push({ code: 'GAP', weight: W.GAP, classId: c.classId, weekday: w, period: p });
          if (heavy.has(sid) && p >= 4) warnings.push({ code: 'S6', weight: W.S6, classId: c.classId, subjectId: sid, weekday: w, period: p });
          if (afternoonFirst.has(sid) && sessionOf(p) === 0 && !fixedCells.has(cellKey(w, p))) {
            warnings.push({ code: 'S7', weight: W.S7, classId: c.classId, subjectId: sid, weekday: w, period: p });
          }
        }
      }
    }
    for (const [dk, periods] of perDay) {
      const [subjectId, weekday] = dk.split('|');
      const list2 = [...periods].sort((a, b) => a - b);
      for (let j = 1; j < list2.length; j += 1) {
        if (list2[j] - list2[j - 1] !== 1 || sessionOf(list2[j]) !== sessionOf(list2[j - 1])) {
          warnings.push({ code: 'S3', weight: W.S3, classId: c.classId, subjectId, weekday: Number(weekday), period: list2[j] });
        }
      }
    }
    for (const s of c.subjects) {
      const dayCount = new Set([...perDay.keys()].filter((k) => k.startsWith(`${s.subjectId}|`))).size;
      if ((perSubject.get(s.subjectId) ?? 0) >= 2 && dayCount < 2) warnings.push({ code: 'S5', weight: W.S5, classId: c.classId, subjectId: s.subjectId });
    }
  }

  for (const [tk, classIds] of teacherAt) {
    if (classIds.length < 2) continue;
    const [teacherId, cell] = tk.split('|');
    const [weekday, period] = cell.split('-').map(Number);
    errors.push({ code: 'TEACHER_CLASH', teacherId, classIds, weekday, period });
  }
  for (const [rk, classIds] of roomUse) {
    const [subjectId, cell] = rk.split('|');
    const rooms = cfg.rooms[subjectId];
    if (classIds.length > rooms) {
      const [weekday, period] = cell.split('-').map(Number);
      errors.push({ code: 'ROOM_FULL', subjectId, classIds, weekday, period, rooms });
    }
  }

  // Soft rule of the teachers: S2 gaps inside a session.
  for (const [t, cells] of teacherCells) {
    for (const w of days) {
      for (const sess of [0, 1]) {
        const ps = [...grid].filter((k) => Number(k.split('-')[0]) === w).map((k) => Number(k.split('-')[1])).filter((p) => sessionOf(p) === sess).sort((a, b) => a - b);
        const teach = ps.filter((p) => cells.has(cellKey(w, p)) || ctx.busyWhy?.get(t)?.get(cellKey(w, p)));
        if (teach.length >= 2) {
          const gaps = ps.filter((p) => p > teach[0] && p < teach[teach.length - 1] && !teach.includes(p)).length;
          if (gaps) warnings.push({ code: 'S2', weight: gaps * W.S2, teacherId: t, weekday: w, count: gaps });
        }
      }
    }
  }
  return finish({ errors, warnings, loads });
}

function finish({ errors, warnings, loads }) {
  warnings.sort((a, b) => b.weight - a.weight);
  return { ok: errors.length === 0, errors, warnings, loads, score: warnings.reduce((n, w) => n + w.weight, 0) };
}
