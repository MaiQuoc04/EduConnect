// FE-10 automatic scheduling (Dung, 17/11/2026) – service. Spec: docs/business-rules.md §10 "Automatic scheduling" and
// the doc "Đặc tả: Tự động phân công & xếp thời khoá biểu".
//   options()  – what the screen needs: open years, semesters, classes, subjects, teachers, defaults.
//   run()      – checks the data, then step A (teaching assignment) and/or step B (timetable): a DRAFT, nothing saved.
//   apply()    – checks the draft again against the database (never trusts the client), then saves it with the same
//                code as SCR-19 (assignments) and UC-71 (timetable versions + periods) in one transaction.
// The range: from today (or the semester's first day) to the semester's last day. Assignments made by step A run
// from that day to the end of the school year (one teacher per class and subject for the year).
import { createHash } from 'node:crypto';
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';
import { syncClassTeachers } from '../classes/classGroups.js';
import * as teacherQueries from '../teacher/teacher.queries.js';
import { assignTeachers, countedPeriods, MORNING_LAST, solveTimetable } from './timetable.auto.solver.js';
import { teachingLoad } from '../school-settings/schoolSettings.service.js';
import { reviewDraft } from './timetable.auto.review.js';
import { AUTO_LIMITS, ERROR_CODES } from './timetable.constants.js';
import { internals } from './timetable.service.js';

const conflict = (code, message, details) => new AppError(409, code, message, details);
const pairKey = (classId, subjectId) => `${classId}:${subjectId}`;

// Week grid → the periods of each day: morning 1..m, afternoon 6..(5 + a).
export const gridDays = (grid) =>
  grid.map((d) => ({
    weekday: d.weekday,
    periods: [...Array.from({ length: d.morning }, (_, i) => i + 1), ...Array.from({ length: d.afternoon }, (_, i) => MORNING_LAST + 1 + i)],
  }));

// ── options ────────────────────────────────────────────────────────────────

export function autoOptions({ schoolYearId }) {
  return internals.guard(async () => {
    const day = await internals.today();
    const years = (await internals.schoolYears()).filter((y) => y.endDate >= day);
    const year = years.find((y) => String(y.id) === String(schoolYearId)) ?? years.find((y) => y.startDate <= day) ?? years.at(-1) ?? null;
    if (!year) return { today: day, years: [], schoolYearId: null, semesters: [], classes: [], subjects: [], teachers: [], timeSlots: [], limits: AUTO_LIMITS };
    const [{ rows: semesters }, { rows: classes }, { rows: subjects }, { rows: teachers }, slots, teaching] = await Promise.all([
      pool.query(
        `SELECT semester_id AS "semesterId", semester_no AS "no", to_char(start_date, 'YYYY-MM-DD') AS "startDate",
                to_char(end_date, 'YYYY-MM-DD') AS "endDate", status
         FROM semesters WHERE school_year_id = $1 ORDER BY semester_no`,
        [year.id],
      ),
      pool.query(
        `SELECT c.class_id AS "classId", c.class_name AS "className", gl.grade_level_name AS "gradeName",
                ct.track_name AS "trackName", c.track_id AS "trackId", c.homeroom_teacher_id AS "homeroomTeacherId",
                hu.full_name AS "homeroomName",
                (SELECT COALESCE(SUM(ts.periods_per_week), 0)::int FROM track_subjects ts
                 WHERE ts.track_id = c.track_id AND ts.school_year_id = c.school_year_id) AS "periodsPerWeek"
         FROM classes c
         JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
         JOIN class_tracks ct ON ct.track_id = c.track_id
         LEFT JOIN teachers ht ON ht.teacher_id = c.homeroom_teacher_id
         LEFT JOIN users hu ON hu.user_id = ht.user_id
         WHERE c.school_year_id = $1 AND c.deleted_at IS NULL
         ORDER BY gl.grade_level_name, c.class_name`,
        [year.id],
      ),
      pool.query(
        `SELECT s.subject_id AS "subjectId", s.subject_code AS "code", s.subject_name AS "name",
                json_object_agg(ts.track_id, ts.periods_per_week) AS "periodsByTrack"
         FROM track_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
         WHERE ts.school_year_id = $1
         GROUP BY s.subject_id, s.subject_code, s.subject_name ORDER BY s.subject_name`,
        [year.id],
      ),
      pool.query(
        `SELECT t.teacher_id AS "teacherId", u.full_name AS "name", t.teacher_code AS "code",
                COALESCE(array_agg(tsj.subject_id::text) FILTER (WHERE tsj.subject_id IS NOT NULL), '{}') AS "subjectIds"
         FROM teachers t JOIN users u ON u.user_id = t.user_id AND u.status = 'ACTIVE'
         LEFT JOIN teacher_subjects tsj ON tsj.teacher_id = t.teacher_id
         GROUP BY t.teacher_id, u.full_name, t.teacher_code ORDER BY u.full_name`,
      ),
      internals.timeSlots(),
      teachingLoad(),
    ]);
    // Defaults by code / name (the School Manager changes them on the screen).
    const byCode = (codes) => subjects.filter((s) => codes.includes(String(s.code).toUpperCase())).map((s) => String(s.subjectId));
    const fixedSubject = subjects.find((s) => String(s.code).toUpperCase() === 'HDTN') ?? subjects.find((s) => /trải nghiệm/i.test(s.name));
    const lastMorning = Math.min(AUTO_LIMITS.MORNING_MAX, MORNING_LAST);
    return {
      today: day,
      years,
      schoolYearId: String(year.id),
      semesters,
      classes,
      subjects,
      teachers,
      timeSlots: slots,
      limits: AUTO_LIMITS,
      defaults: {
        grid: [1, 2, 3, 4, 5].map((w) => ({ weekday: w, morning: 5, afternoon: w === 2 || w === 4 ? 2 : 0 })),
        ...teaching, // norm, homeroomNorm, maxOver, maxPerDay: School Manager settings, read only on this screen
        maxPerSubjectDay: AUTO_LIMITS.MAX_PER_SUBJECT_DAY,
        heavySubjectIds: byCode(['TOAN', 'VAN', 'ANH']),
        afternoonSubjectIds: subjects.filter((s) => /^chuyên đề/i.test(s.name)).map((s) => String(s.subjectId)),
        rooms: Object.fromEntries(byCode(['TIN']).map((id) => [id, 1])),
        fixed: fixedSubject
          ? { subjectId: String(fixedSubject.subjectId), slots: [{ weekday: 1, period: 1, label: 'Chào cờ' }, { weekday: 5, period: lastMorning, label: 'Sinh hoạt lớp' }] }
          : null,
        timeLimitSec: AUTO_LIMITS.TIME_LIMIT_SEC,
      },
    };
  });
}

// ── context: everything a run / apply needs, read in one place ─────────────

async function loadContext(cfg, db = pool) {
  const day = await internals.today(db);
  const { rows: yr } = await db.query(
    `SELECT school_year_id AS "id", year_name AS "name", to_char(start_date, 'YYYY-MM-DD') AS "startDate",
            to_char(end_date, 'YYYY-MM-DD') AS "endDate" FROM school_years WHERE school_year_id = $1`,
    [cfg.schoolYearId],
  );
  if (!yr.length) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  const year = yr[0];
  if (day > year.endDate) throw conflict(ERROR_CODES.SCHOOL_YEAR_ENDED, 'The school year has ended.');
  const { rows: sem } = await db.query(
    `SELECT semester_id AS "semesterId", semester_no AS "no", to_char(start_date, 'YYYY-MM-DD') AS "startDate",
            to_char(end_date, 'YYYY-MM-DD') AS "endDate"
     FROM semesters WHERE semester_id = $1 AND school_year_id = $2`,
    [cfg.semesterId, cfg.schoolYearId],
  );
  if (!sem.length) throw notFound(ERROR_CODES.SEMESTER_NOT_FOUND, 'Semester not found.');
  const semester = sem[0];
  if (day > semester.endDate) throw conflict(ERROR_CODES.SEMESTER_ENDED, 'The semester is over.');
  const start = day > semester.startDate ? day : semester.startDate;
  const range = { start, end: semester.endDate, assignEnd: year.endDate };

  const { rows: classRows } = await db.query(
    `SELECT c.class_id::text AS "classId", c.class_name AS "className", c.homeroom_teacher_id::text AS "homeroomTeacherId",
            c.track_id AS "trackId"
     FROM classes c WHERE c.class_id = ANY($1::bigint[]) AND c.school_year_id = $2 AND c.deleted_at IS NULL
     ORDER BY c.class_name`,
    [cfg.classIds, cfg.schoolYearId],
  );
  if (classRows.length !== cfg.classIds.length) {
    throw badRequest(ERROR_CODES.AUTO_INVALID, 'Some classes are not in this school year.', { field: 'classIds', reason: 'NOT_IN_YEAR' });
  }
  const pairs = (await teacherQueries.findClassSubjectsOfYear(cfg.schoolYearId, db)).map((p) => ({ ...p, classId: String(p.classId), subjectId: String(p.subjectId) }));
  const subjectName = new Map(pairs.map((p) => [p.subjectId, p.subjectName]));
  const inRun = new Set(cfg.classIds.map(String));
  const classes = classRows.map((c) => ({
    ...c,
    subjects: pairs
      .filter((p) => p.classId === c.classId)
      .map((p) => ({ subjectId: p.subjectId, periods: cfg.periods[p.subjectId] ?? p.periodsPerWeek }))
      .filter((s) => s.periods > 0),
  }));

  const { rows: teacherRows } = await db.query(
    `SELECT t.teacher_id::text AS "teacherId", u.full_name AS "name", u.status,
            COALESCE(array_agg(tsj.subject_id::text) FILTER (WHERE tsj.subject_id IS NOT NULL), '{}') AS "subjectIds",
            EXISTS (SELECT 1 FROM classes hc WHERE hc.homeroom_teacher_id = t.teacher_id AND hc.school_year_id = $1
                    AND hc.deleted_at IS NULL) AS "homeroom"
     FROM teachers t JOIN users u ON u.user_id = t.user_id
     LEFT JOIN teacher_subjects tsj ON tsj.teacher_id = t.teacher_id
     GROUP BY t.teacher_id, u.full_name, u.status ORDER BY u.full_name`,
    [cfg.schoolYearId],
  );
  // Assignments running on the first day: the run's classes (kept, or the current state) and the others (load).
  const active = (await teacherQueries.findActiveOnDate(cfg.schoolYearId, start, db)).map((a) => ({ ...a, classId: String(a.classId), subjectId: String(a.subjectId), teacherId: String(a.teacherId) }));
  const periodsOf = new Map(pairs.map((p) => [pairKey(p.classId, p.subjectId), p.periodsPerWeek]));
  const solverOpts = { fixed: cfg.fixed };
  const baseLoad = new Map();
  for (const a of active) {
    if (inRun.has(a.classId)) continue;
    const n = countedPeriods(a.subjectId, periodsOf.get(pairKey(a.classId, a.subjectId)) ?? 0, solverOpts);
    baseLoad.set(a.teacherId, (baseLoad.get(a.teacherId) ?? 0) + n);
  }
  const current = new Map(active.filter((a) => inRun.has(a.classId)).map((a) => [pairKey(a.classId, a.subjectId), a.teacherId]));

  // Lessons of the other classes in the range: their teachers are busy at that weekday + period.
  const { rows: busyRows } = await db.query(
    `SELECT ts.teacher_id::text AS "teacherId", EXTRACT(ISODOW FROM ts."date")::int AS "weekday", sl.period_number AS "period",
            string_agg(DISTINCT c.class_name, ', ') AS "classNames"
     FROM timetable_slots ts JOIN time_slots sl ON sl.slot_id = ts.slot_id JOIN classes c ON c.class_id = ts.class_id
     WHERE ts."date" BETWEEN $1::date AND $2::date AND NOT (ts.class_id = ANY($3::bigint[])) AND ts.teacher_id IS NOT NULL
     GROUP BY ts.teacher_id, EXTRACT(ISODOW FROM ts."date"), sl.period_number`,
    [start, semester.endDate, cfg.classIds],
  );
  const busy = new Map();
  // Why a teacher is busy at a cell (shown when a draft is edited by hand): the other classes taught then, or null for a
  // cell marked busy on the screen.
  const busyWhy = new Map();
  for (const b of [...busyRows, ...cfg.busy]) {
    const id = String(b.teacherId);
    const cell = `${b.weekday}-${b.period}`;
    if (!busy.has(id)) busy.set(id, new Set());
    busy.get(id).add(cell);
    if (!busyWhy.has(id)) busyWhy.set(id, new Map());
    if (!busyWhy.get(id).get(cell)) busyWhy.get(id).set(cell, b.classNames ?? null);
  }
  const teachers = teacherRows.map((t) => ({
    ...t,
    baseLoad: baseLoad.get(t.teacherId) ?? 0,
    busy: [...(busy.get(t.teacherId) ?? [])],
  }));
  const slots = await internals.timeSlots(db);
  const { rows: versions } = await db.query(
    `SELECT t.class_id::text AS "classId", COUNT(*)::int AS n FROM timetables t
     WHERE t.class_id = ANY($1::bigint[]) AND t.deleted_at IS NULL AND t.start_date <= $3::date AND t.end_date >= $2::date
     GROUP BY t.class_id`,
    [cfg.classIds, start, semester.endDate],
  );
  // Fingerprint of what the draft depends on: assignments and timetable versions of the year.
  const { rows: fp } = await db.query(
    `SELECT md5(
       COALESCE((SELECT string_agg(concat_ws(',', ta.assignment_id, ta.teacher_id, ta.start_date, ta.end_date), '|' ORDER BY ta.assignment_id)
                 FROM teaching_assignments ta JOIN classes c ON c.class_id = ta.class_id
                 WHERE c.school_year_id = $1 AND ta.deleted_at IS NULL), '') || '#' ||
       COALESCE((SELECT string_agg(concat_ws(',', t.timetable_id, t.start_date, t.end_date), '|' ORDER BY t.timetable_id)
                 FROM timetables t JOIN classes c ON c.class_id = t.class_id
                 WHERE c.school_year_id = $1 AND t.deleted_at IS NULL), '')) AS "stamp"`,
    [cfg.schoolYearId],
  );
  return {
    day, year, semester, range, classes, teachers, subjectName, current, slots, busyWhy,
    withTimetable: new Set(versions.map((v) => v.classId)),
    stamp: createHash('md5').update(`${fp[0].stamp}|${start}`).digest('hex'),
  };
}

// ── checks before running: blocking errors + warnings ──────────────────────

function preCheck(cfg, ctx) {
  const errors = [];
  const warnings = [];
  const days = gridDays(cfg.grid);
  const cells = days.reduce((n, d) => n + d.periods.length, 0);
  const slotNumbers = new Set(ctx.slots.map((s) => s.period));
  const missingSlots = [...new Set(days.flatMap((d) => d.periods).filter((p) => !slotNumbers.has(p)))];
  if (missingSlots.length) errors.push({ code: 'PERIOD_MISSING', periods: missingSlots });
  const fixedSlots = cfg.fixed?.slots ?? [];
  const inGrid = new Set(days.flatMap((d) => d.periods.map((p) => `${d.weekday}-${p}`)));
  const outside = fixedSlots.filter((f) => !inGrid.has(`${f.weekday}-${f.period}`));
  if (outside.length) errors.push({ code: 'FIXED_OUTSIDE_GRID', slots: outside });

  const teacherById = new Map(ctx.teachers.map((t) => [t.teacherId, t]));
  const qualified = (sid) => ctx.teachers.filter((t) => t.status === 'ACTIVE' && t.subjectIds.includes(sid));
  for (const c of ctx.classes) {
    const total = c.subjects.reduce((n, s) => n + s.periods, 0);
    if (!c.subjects.length) errors.push({ code: 'CLASS_NO_SUBJECTS', classId: c.classId, className: c.className });
    else if (total > cells) errors.push({ code: 'CLASS_TOO_MANY', classId: c.classId, className: c.className, total, cells });
    else if (total < cells) warnings.push({ code: 'CLASS_EMPTY_CELLS', classId: c.classId, className: c.className, total, cells });
    if (cfg.fixed && !c.subjects.some((s) => s.subjectId === cfg.fixed.subjectId)) {
      warnings.push({ code: 'CLASS_NO_FIXED_SUBJECT', classId: c.classId, className: c.className });
    }
    if (cfg.mode !== 'TIMETABLE' && !c.homeroomTeacherId) warnings.push({ code: 'CLASS_NO_HOMEROOM', classId: c.classId, className: c.className });
  }
  const demand = new Map();
  for (const c of ctx.classes) {
    for (const s of c.subjects) demand.set(s.subjectId, (demand.get(s.subjectId) ?? 0) + s.periods);
  }
  const keepOrFixed = cfg.mode === 'TIMETABLE' || cfg.keepAssignments;
  const fixedCells = new Set(fixedSlots.map((f) => `${f.weekday}-${f.period}`));

  // A kept assignment of the fixed-slot subject whose teacher is busy at a fixed slot: its pinned lesson cannot be
  // placed (25/11/2026 – HĐTN of 12D1 kept for a teacher who has Chào cờ in 10A1 at the same time).
  if (keepOrFixed && fixedCells.size) {
    for (const c of ctx.classes) {
      if (!c.subjects.some((s) => s.subjectId === cfg.fixed.subjectId)) continue;
      const t = teacherById.get(ctx.current.get(pairKey(c.classId, cfg.fixed.subjectId)));
      const cell = t && t.busy.find((k) => fixedCells.has(k));
      if (cell) {
        const [weekday, period] = cell.split('-').map(Number);
        errors.push({ code: 'FIXED_TEACHER_BUSY', classId: c.classId, className: c.className, teacher: t.name, weekday, period,
          classes: ctx.busyWhy.get(t.teacherId)?.get(cell) ?? null });
      }
    }
  }

  if (cfg.mode === 'TIMETABLE') {
    // Step B alone: every pair needs a running assignment with an active teacher.
    const missing = [];
    for (const c of ctx.classes) {
      for (const s of c.subjects) {
        const t = ctx.current.get(pairKey(c.classId, s.subjectId));
        if (!t) missing.push({ classId: c.classId, className: c.className, subjectId: s.subjectId, subject: ctx.subjectName.get(s.subjectId) });
        else if (teacherById.get(t)?.status !== 'ACTIVE') {
          missing.push({ classId: c.classId, className: c.className, subjectId: s.subjectId, subject: ctx.subjectName.get(s.subjectId), locked: true });
        }
      }
    }
    if (missing.length) errors.push({ code: 'NOT_ASSIGNED', items: missing.slice(0, 20), count: missing.length });
  } else {
    // Step A: enough qualified teachers for each subject (a necessary condition: shared teachers count once each).
    for (const [sid, need] of demand) {
      const q = qualified(sid);
      const keep = keepOrFixed
        ? ctx.classes.filter((c) => ctx.current.has(pairKey(c.classId, sid)) && c.subjects.some((s) => s.subjectId === sid)).length
        : 0;
      if (!q.length && keep < ctx.classes.filter((c) => c.subjects.some((s) => s.subjectId === sid)).length) {
        errors.push({ code: 'NO_QUALIFIED', subjectId: sid, subject: ctx.subjectName.get(sid) });
        continue;
      }
      const counted = ctx.classes.reduce((n, c) => {
        const s = c.subjects.find((x) => x.subjectId === sid);
        return n + (s ? countedPeriods(sid, s.periods, cfg) : 0);
      }, 0);
      const capacity = q.reduce((n, t) => n + Math.max(0, (t.homeroom ? cfg.homeroomNorm : cfg.norm) + cfg.maxOver - t.baseLoad), 0);
      if (!keepOrFixed && counted > capacity) {
        const avg = cfg.norm;
        errors.push({ code: 'NOT_ENOUGH_TEACHERS', subjectId: sid, subject: ctx.subjectName.get(sid), need: counted, capacity,
          short: counted - capacity, teachersMore: Math.ceil((counted - capacity) / avg), teachers: q.length });
      } else if (!keepOrFixed && counted > q.reduce((n, t) => n + Math.max(0, (t.homeroom ? cfg.homeroomNorm : cfg.norm) - t.baseLoad), 0)) {
        warnings.push({ code: 'OVER_NORM_NEEDED', subjectId: sid, subject: ctx.subjectName.get(sid), need: counted });
      }
    }
    if (cfg.fixed?.slots.length) {
      const needing = ctx.classes.filter((c) => c.subjects.some((s) => s.subjectId === cfg.fixed.subjectId)).length;
      // A teacher busy at a fixed slot (lesson of another class) cannot take the fixed-slot subject (25/11/2026).
      const q = qualified(cfg.fixed.subjectId).filter((t) => !t.busy.some((k) => fixedCells.has(k))).length;
      if (needing > q && !keepOrFixed) {
        errors.push({ code: 'FIXED_TEACHERS', subjectId: cfg.fixed.subjectId, subject: ctx.subjectName.get(cfg.fixed.subjectId), classes: needing, teachers: q });
      }
    }
  }
  // Rooms: lessons of a subject in one week ≤ rooms × cells.
  for (const [sid, n] of Object.entries(cfg.rooms)) {
    const need = demand.get(sid) ?? 0;
    if (need > n * cells) errors.push({ code: 'ROOM_TOO_FEW', subjectId: sid, subject: ctx.subjectName.get(sid), need, rooms: n, cells });
  }
  // Teachers marked busy that do not exist.
  const unknownBusy = cfg.busy.filter((b) => !teacherById.has(b.teacherId));
  if (unknownBusy.length) errors.push({ code: 'BUSY_UNKNOWN_TEACHER' });
  return { errors, warnings, cells };
}

const solverOptions = (cfg) => ({
  norm: cfg.norm,
  homeroomNorm: cfg.homeroomNorm,
  maxOver: cfg.maxOver,
  maxPerDay: cfg.maxPerDay,
  maxPerSubjectDay: cfg.maxPerSubjectDay,
  rooms: cfg.rooms,
  heavy: cfg.heavySubjectIds,
  afternoon: cfg.afternoonSubjectIds,
  fixed: cfg.fixed,
  weights: cfg.weights,
  seed: cfg.seed,
  timeLimitMs: cfg.timeLimitSec * 1000,
});

// ── run: a draft ───────────────────────────────────────────────────────────

export function runAuto(input) {
  return internals.guard(async () => {
    // Teaching load (norms, periods over the norm, periods a day): the School Manager settings, never the request.
    const teaching = await teachingLoad();
    const cfg = { ...input, ...teaching };
    const ctx = await loadContext(cfg);
    const check = preCheck(cfg, ctx);
    const base = {
      teaching,
      ...editInfo(ctx),
      range: ctx.range,
      semester: ctx.semester,
      stamp: ctx.stamp,
      cells: check.cells,
      errors: check.errors,
      warnings: check.warnings,
      existing: ctx.classes.map((c) => ({
        classId: c.classId,
        className: c.className,
        hasTimetable: ctx.withTimetable.has(c.classId),
        assigned: c.subjects.filter((s) => ctx.current.has(pairKey(c.classId, s.subjectId))).length,
        subjects: c.subjects.length,
      })),
    };
    if (check.errors.length) return { ok: false, ...base };

    const options = solverOptions(cfg);
    const active = ctx.teachers.filter((t) => t.status === 'ACTIVE');
    let assignments = {};
    let unassigned = [];
    let loads = null;
    const keep = {};
    if (cfg.mode === 'TIMETABLE' || cfg.keepAssignments) {
      for (const c of ctx.classes) {
        for (const s of c.subjects) {
          const t = ctx.current.get(pairKey(c.classId, s.subjectId));
          if (t) keep[pairKey(c.classId, s.subjectId)] = t;
        }
      }
    }
    if (cfg.mode === 'TIMETABLE') {
      assignments = keep;
    } else {
      const a = assignTeachers({ classes: ctx.classes, teachers: active, fixedAssignments: keep, options });
      ({ assignments, unassigned, loads } = a);
    }
    let timetable = null;
    if (cfg.mode !== 'ASSIGN') {
      timetable = solveTimetable({ days: gridDays(cfg.grid), classes: ctx.classes, assignments, teachers: ctx.teachers, options });
    }
    // Teacher load of the draft (this run + other classes), counted periods only.
    const load = new Map(ctx.teachers.map((t) => [t.teacherId, t.baseLoad]));
    for (const c of ctx.classes) {
      for (const s of c.subjects) {
        const t = assignments[pairKey(c.classId, s.subjectId)];
        if (t) load.set(t, (load.get(t) ?? 0) + countedPeriods(s.subjectId, s.periods, cfg));
      }
    }
    const used = new Set(Object.values(assignments).map(String));
    const teacherLoads = ctx.teachers
      .filter((t) => used.has(t.teacherId))
      .map((t) => {
        const norm = t.homeroom ? cfg.homeroomNorm : cfg.norm;
        const l = load.get(t.teacherId) ?? 0;
        return { teacherId: t.teacherId, name: t.name, homeroom: t.homeroom, norm, base: t.baseLoad, load: l, over: Math.max(0, l - norm) };
      })
      .sort((x, y) => y.over - x.over || y.load - x.load || x.name.localeCompare(y.name, 'vi'));

    return {
      ok: true,
      ...base,
      seed: cfg.seed,
      assignments: Object.entries(assignments).map(([k, teacherId]) => {
        const [classId, subjectId] = k.split(':');
        return { classId, subjectId, teacherId: String(teacherId), kept: keep[k] != null, changed: ctx.current.get(k) !== String(teacherId) };
      }),
      unassigned,
      timetables: timetable?.entries ?? null,
      unplaced: timetable?.unplaced ?? [],
      violations: timetable?.violations ?? [],
      score: timetable?.score ?? 0,
      loads: teacherLoads,
      // The same checks as a draft edited by hand (POST /auto/check), so the screen shows one kind of list.
      review: reviewDraft(cfg, ctx, {
        assignments: Object.entries(assignments).map(([k, teacherId]) => {
          const [classId, subjectId] = k.split(':');
          return { classId, subjectId, teacherId: String(teacherId) };
        }),
        timetables: Object.fromEntries(Object.entries(timetable?.entries ?? {}).map(([cid, list]) => [cid, list.map((e) => ({ weekday: e.weekday, period: e.period, subjectId: String(e.subjectId) }))])),
      }),
      teacherNames: Object.fromEntries(ctx.teachers.map((t) => [t.teacherId, t.name])),
      subjectNames: Object.fromEntries(ctx.subjectName),
      loadsBefore: loads,
    };
  });
}

// What the screen needs to edit a draft by hand: subjects and periods of each class, its homeroom teacher, and when
// each teacher is busy (other classes taught then, or null = marked busy on the screen).
function editInfo(ctx) {
  return {
    classSubjects: Object.fromEntries(ctx.classes.map((c) => [c.classId, c.subjects])),
    homerooms: Object.fromEntries(ctx.classes.map((c) => [c.classId, c.homeroomTeacherId ?? null])),
    busy: Object.fromEntries([...ctx.busyWhy].map(([t, m]) => [t, Object.fromEntries(m)])),
    // Periods each teacher already teaches in classes outside the run, and whether they are a homeroom teacher, so the
    // screen can check the weekly maximum of any teacher before offering them.
    teacherBase: Object.fromEntries(ctx.teachers.map((t) => [t.teacherId, { base: t.baseLoad, homeroom: Boolean(t.homeroom) }])),
  };
}

// ── check: a draft edited by hand, nothing saved (Dung, 21/11/2026) ──────────

export function checkAuto({ config, draft }) {
  return internals.guard(async () => {
    const cfg = { ...config, ...(await teachingLoad()) };
    const ctx = await loadContext(cfg);
    return { stamp: ctx.stamp, ...reviewDraft(cfg, ctx, draft) };
  });
}

// ── apply: check the draft again, then save ────────────────────────────────

function checkDraft(cfg, ctx, draft) {
  const fail = (problem, details = {}) => badRequest(ERROR_CODES.AUTO_DRAFT_INVALID, `The draft breaks a rule: ${problem}.`, { problem, ...details });
  const classById = new Map(ctx.classes.map((c) => [c.classId, c]));
  const teacherById = new Map(ctx.teachers.map((t) => [t.teacherId, t]));
  const cn = (id) => classById.get(id)?.className ?? id;
  const sn = (id) => ctx.subjectName.get(id) ?? id;
  const tn = (id) => teacherById.get(id)?.name ?? id;

  // Assignments: the draft's (steps A) or the running ones (step B alone).
  const assign = new Map();
  if (cfg.mode === 'TIMETABLE') {
    for (const [k, t] of ctx.current) assign.set(k, t);
  } else {
    for (const a of draft.assignments) {
      const c = classById.get(a.classId);
      if (!c) throw fail('CLASS_NOT_IN_RUN', { classId: a.classId });
      if (!c.subjects.some((s) => s.subjectId === a.subjectId)) throw fail('SUBJECT_NOT_IN_CLASS', { className: cn(a.classId), subject: sn(a.subjectId) });
      const t = teacherById.get(a.teacherId);
      if (!t || t.status !== 'ACTIVE') throw fail('TEACHER_UNKNOWN', { className: cn(a.classId), subject: sn(a.subjectId) });
      if (!t.subjectIds.includes(a.subjectId)) throw fail('NOT_QUALIFIED', { teacher: t.name, subject: sn(a.subjectId) });
      if (assign.has(pairKey(a.classId, a.subjectId))) throw fail('DUPLICATE_PAIR', { className: cn(a.classId), subject: sn(a.subjectId) });
      assign.set(pairKey(a.classId, a.subjectId), a.teacherId);
    }
    const missing = ctx.classes.flatMap((c) => c.subjects.filter((s) => !assign.has(pairKey(c.classId, s.subjectId))).map((s) => `${c.className} – ${sn(s.subjectId)}`));
    if (missing.length) throw conflict(ERROR_CODES.AUTO_INCOMPLETE, 'Some subjects have no teacher.', { items: missing.slice(0, 10), count: missing.length });
    // Weekly cap (H3) and the fixed-slot subject taught by a different teacher in every class.
    const load = new Map(ctx.teachers.map((t) => [t.teacherId, t.baseLoad]));
    const fixedBy = new Map();
    for (const c of ctx.classes) {
      for (const s of c.subjects) {
        const t = assign.get(pairKey(c.classId, s.subjectId));
        load.set(t, load.get(t) + countedPeriods(s.subjectId, s.periods, cfg));
        if (cfg.fixed?.slots.length && s.subjectId === cfg.fixed.subjectId) {
          if (fixedBy.has(t)) throw fail('FIXED_SAME_TEACHER', { teacher: tn(t), classes: [cn(fixedBy.get(t)), c.className] });
          fixedBy.set(t, c.classId);
        }
      }
    }
    for (const [t, l] of load) {
      const tt = teacherById.get(t);
      if (!tt) continue;
      const cap = (tt.homeroom ? cfg.homeroomNorm : cfg.norm) + cfg.maxOver;
      if (l > cap && [...assign.values()].includes(t)) throw fail('OVER_CAP', { teacher: tt.name, load: l, cap });
    }
  }
  if (cfg.mode === 'ASSIGN') return { assign, entries: null };

  // Timetables (H4–H10).
  const days = gridDays(cfg.grid);
  const inGrid = new Set(days.flatMap((d) => d.periods.map((p) => `${d.weekday}-${p}`)));
  const slotByPeriod = new Map(ctx.slots.map((s) => [s.period, s.slotId]));
  const teacherAt = new Map();
  const busy = new Map(ctx.teachers.map((t) => [t.teacherId, new Set(t.busy)]));
  const roomUse = new Map();
  const entries = {};
  for (const c of ctx.classes) {
    const list = draft.timetables[c.classId];
    if (!list) throw fail('CLASS_MISSING', { className: c.className });
    const seen = new Set();
    const perSubject = new Map();
    const perDay = new Map();
    for (const e of list) {
      const cell = `${e.weekday}-${e.period}`;
      if (!inGrid.has(cell) || !slotByPeriod.has(e.period)) throw fail('OUTSIDE_GRID', { className: c.className, weekday: e.weekday, period: e.period });
      if (seen.has(cell)) throw fail('CLASS_CLASH', { className: c.className, weekday: e.weekday, period: e.period });
      seen.add(cell);
      if (!c.subjects.some((s) => s.subjectId === e.subjectId)) throw fail('SUBJECT_NOT_IN_CLASS', { className: c.className, subject: sn(e.subjectId) });
      perSubject.set(e.subjectId, (perSubject.get(e.subjectId) ?? 0) + 1);
      const dk = `${e.subjectId}|${e.weekday}`;
      perDay.set(dk, (perDay.get(dk) ?? 0) + 1);
      if (perDay.get(dk) > cfg.maxPerSubjectDay) throw fail('SUBJECT_DAY_LIMIT', { className: c.className, subject: sn(e.subjectId), weekday: e.weekday });
      const t = assign.get(pairKey(c.classId, e.subjectId));
      if (!t) throw fail('NO_TEACHER', { className: c.className, subject: sn(e.subjectId) });
      if (busy.get(t)?.has(cell)) throw fail('TEACHER_BUSY', { teacher: tn(t), weekday: e.weekday, period: e.period });
      if (teacherAt.has(`${t}|${cell}`)) {
        throw fail('TEACHER_CLASH', { teacher: tn(t), weekday: e.weekday, period: e.period, classes: [teacherAt.get(`${t}|${cell}`), c.className] });
      }
      teacherAt.set(`${t}|${cell}`, c.className);
      if (cfg.rooms[e.subjectId] != null) {
        const rk = `${e.subjectId}|${cell}`;
        roomUse.set(rk, (roomUse.get(rk) ?? 0) + 1);
        if (roomUse.get(rk) > cfg.rooms[e.subjectId]) throw fail('ROOM_FULL', { subject: sn(e.subjectId), weekday: e.weekday, period: e.period });
      }
    }
    for (const s of c.subjects) {
      if ((perSubject.get(s.subjectId) ?? 0) !== s.periods) {
        throw conflict(ERROR_CODES.AUTO_INCOMPLETE, 'A subject does not have its periods.', {
          items: [`${c.className} – ${sn(s.subjectId)}: ${perSubject.get(s.subjectId) ?? 0}/${s.periods}`], count: 1,
        });
      }
    }
    // Fixed slots keep the fixed subject.
    for (const f of cfg.fixed?.slots ?? []) {
      if (!c.subjects.some((s) => s.subjectId === cfg.fixed.subjectId)) continue;
      const at = list.find((e) => e.weekday === f.weekday && e.period === f.period);
      if (!at || at.subjectId !== cfg.fixed.subjectId) throw fail('FIXED_SLOT', { className: c.className, weekday: f.weekday, period: f.period });
    }
    entries[c.classId] = list.map((e) => ({ weekday: e.weekday, slotId: slotByPeriod.get(e.period), subjectId: e.subjectId, room: null }));
  }
  return { assign, entries };
}

export function applyAuto({ config, stamp, confirmOverwrite, draft }, user) {
  return internals.guard(() =>
    withTransaction(async (db) => {
      // Re-checked with the settings in force now (they may have changed since the draft was made).
      const cfg = { ...config, ...(await teachingLoad(db)) };
      // One run at a time per year: lock its classes (SCR-19 saves lock them too).
      await teacherQueries.lockClassesOfYear(cfg.schoolYearId, db);
      const ctx = await loadContext(cfg, db);
      if (stamp !== ctx.stamp) throw conflict(ERROR_CODES.AUTO_STALE, 'Assignments or timetables changed after the draft was made.');
      const { assign, entries } = checkDraft(cfg, ctx, draft);

      const { start, end, assignEnd } = ctx.range;
      const changedPairs = cfg.mode === 'TIMETABLE' ? [] : [...assign].filter(([k, t]) => ctx.current.get(k) !== t);
      const overwrite = ctx.classes.filter((c) => (cfg.mode !== 'ASSIGN' && ctx.withTimetable.has(c.classId))
        || changedPairs.some(([k]) => k.startsWith(`${c.classId}:`) && ctx.current.has(k)));
      if (overwrite.length && !confirmOverwrite) {
        throw conflict(ERROR_CODES.AUTO_CONFIRM, 'Some classes already have a timetable or assignments.', { classes: overwrite.map((c) => c.className) });
      }

      // Lessons of the run's classes in the range are generated again: free them first so that the new teachers of
      // one class do not clash with the old lessons of another class of the run.
      if (cfg.mode !== 'ASSIGN') {
        await db.query(
          `DELETE FROM timetable_slots ts
           WHERE ts.class_id = ANY($1::bigint[]) AND ts."date" BETWEEN $2::date AND $3::date
             AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)`,
          [cfg.classIds, start, end],
        );
      }
      // Step A: one row per (class, subject) from `start` to the end of the year (history before it kept).
      const clashes = [];
      for (const [k, teacherId] of changedPairs) {
        const [classId, subjectId] = k.split(':');
        await teacherQueries.clearRange(classId, subjectId, start, assignEnd, db);
        const busyNow = await teacherQueries.findTeacherClashes(teacherId, classId, subjectId, start, assignEnd, db);
        if (busyNow.length) {
          clashes.push({ className: ctx.classes.find((c) => c.classId === classId)?.className, subject: ctx.subjectName.get(subjectId), items: busyNow });
          continue;
        }
        await teacherQueries.insertAssignment({ classId, subjectId, teacherId, startDate: start, endDate: assignEnd }, db);
        await teacherQueries.mergeTouchingRows(classId, subjectId, db);
        await teacherQueries.moveFreeSlotsToTeacher(teacherId, classId, subjectId, start, assignEnd, db);
      }
      if (clashes.length) {
        throw conflict(ERROR_CODES.TIMETABLE_TEACHER_CLASH, 'A new teacher already teaches at lessons after this semester.', {
          className: clashes[0].className,
          items: clashes.flatMap((c) => c.items.map((i) => ({ ...i, teacher: '', subject: c.subject }))).slice(0, 10),
        });
      }
      for (const classId of new Set(changedPairs.map(([k]) => k.split(':')[0]))) await syncClassTeachers(db, Number(classId));

      // Step B: one timetable version per class for [start, end], periods generated (UC-71 code).
      let generated = 0;
      if (cfg.mode !== 'ASSIGN') {
        for (const c of ctx.classes) {
          const cls = await internals.classInfo(c.classId, db);
          const r = await internals.saveVersion(db, { cls, start, end, entries: entries[c.classId], userId: user.userId });
          generated += r.generated;
        }
      }
      return {
        classes: ctx.classes.length,
        assignmentsChanged: changedPairs.length,
        generated,
        range: { start, end, assignEnd },
      };
    }),
  );
}
