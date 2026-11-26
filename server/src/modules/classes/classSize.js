import { AppError } from '../../utils/AppError.js';
import { classSizeLimits } from '../school-settings/schoolSettings.service.js';

// FE-04 class size (27/11/2026, Khanh; lead agreed): two School Manager settings ("Cài đặt hệ thống", SCR-86 / UC-133,
// group "classes") replace the fixed 45:
//   warnStudents (default 45) – a class may go above it only after the School Manager confirms (the request carries
//                               confirmOverWarning: true; without it 409 MSG_CLASS_OVER_WARNING and nothing is written);
//   maxStudents  (default 55) – never passed (409 MSG_CLASS_FULL, even with the confirmation).
// Counted as STUDYING students, plus the students the request adds. A class already above a limit (the limit was
// lowered later) keeps its students; only adding more is refused (business rules §4).
// Used by UC-28 (create, add students), UC-27 import, UC-10 transfer and UC-11 promotion (FE-02).

const conflict = (code, message, details) => new AppError(409, code, message, details);

export { classSizeLimits };

// targets: [{ classId?, className, current, adding }] (one entry per class the request fills); limits
// { warnStudents, maxStudents }. Throws MSG_CLASS_FULL / MSG_CLASS_OVER_WARNING (no database, unit tested).
export function assessClassSize(targets, limits, { confirmOverWarning = false } = {}) {
  const filled = targets.filter((t) => t.adding > 0).map((t) => ({ ...t, after: t.current + t.adding }));

  const full = filled.find((t) => t.after > limits.maxStudents);
  if (full) {
    throw conflict('MSG_CLASS_FULL', `A class has at most ${limits.maxStudents} students.`, {
      max: limits.maxStudents,
      current: full.current,
      adding: full.adding,
      ...(full.classId !== undefined && { classId: full.classId }),
      className: full.className,
    });
  }
  const over = filled.filter((t) => t.after > limits.warnStudents);
  if (over.length && !confirmOverWarning) {
    throw conflict('MSG_CLASS_OVER_WARNING', `A class would have more than ${limits.warnStudents} students; confirm first.`, {
      warn: limits.warnStudents,
      max: limits.maxStudents,
      classes: over.map((t) => ({ className: t.className, current: t.current, after: t.after })),
    });
  }
}

// Same check with the limits in force. Read through the pool, not the caller's transaction: a missing school_settings
// table (local DB without the patch) must not abort the caller's transaction; the defaults are used then.
export async function checkClassSize(targets, options) {
  const limits = await classSizeLimits();
  assessClassSize(targets, limits, options);
  return limits;
}

// Classes of school years that have not ended with more STUDYING students than `max` (SCR-86, before lowering the
// hard cap). -> [{ classId, className, yearName, students }]
export async function classesOverSize(db, max) {
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", sy.year_name AS "yearName", COUNT(*) AS "students"
     FROM classes c
     JOIN school_years sy ON sy.school_year_id = c.school_year_id AND CURRENT_DATE <= sy.end_date
     JOIN class_enrollments e ON e.class_id = c.class_id AND e.status = 'STUDYING'
     WHERE c.deleted_at IS NULL
     GROUP BY c.class_id, c.class_name, sy.year_name
     HAVING COUNT(*) > $1
     ORDER BY sy.year_name, c.class_name`,
    [max],
  );
  return rows;
}
