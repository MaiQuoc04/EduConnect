// Timetable rows of one (class, subject) from a date that have no attendance yet.
// business-rules §10: rows that already have attendance are kept as they are.
const FREE_SLOTS = `
  FROM timetable_slots ts
  WHERE ts.class_id = ? AND ts.subject_id = ? AND ts."date" >= ?::date
    AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)`;

export async function countFreeSlotsFrom(classId, subjectId, date, db) {
  const [rows] = await db.query(`SELECT COUNT(*)::int AS "n" ${FREE_SLOTS}`, [classId, subjectId, date]);
  return Number(rows[0].n);
}

// Periods where `teacherId` already teaches another lesson at the same date + period (first 5).
export async function findTeacherClashes(teacherId, classId, subjectId, date, db) {
  const [rows] = await db.query(
    `SELECT to_char(ts."date", 'YYYY-MM-DD') AS "date", sl.period_number AS "period", c2.class_name AS "otherClass"
     FROM timetable_slots ts
     JOIN time_slots sl ON sl.slot_id = ts.slot_id
     JOIN timetable_slots other
       ON other.teacher_id = ? AND other."date" = ts."date" AND other.slot_id = ts.slot_id
      AND other.timetable_slot_id <> ts.timetable_slot_id
     JOIN classes c2 ON c2.class_id = other.class_id
     WHERE ts.class_id = ? AND ts.subject_id = ? AND ts."date" >= ?::date
       AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)
     ORDER BY ts."date", sl.period_number
     LIMIT 5`,
    [teacherId, classId, subjectId, date],
  );
  return rows;
}

// No substitute teaching: the timetable teacher must match the assignment.
export async function moveFreeSlotsToTeacher(teacherId, classId, subjectId, date, db) {
  await db.query(`UPDATE timetable_slots SET teacher_id = ? WHERE timetable_slot_id IN (SELECT ts.timetable_slot_id ${FREE_SLOTS})`, [
    teacherId,
    classId,
    subjectId,
    date,
  ]);
}
