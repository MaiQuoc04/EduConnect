// Timetable rows of one (class, subject) from a date that have no attendance yet.
// business-rules §10: rows that already have attendance are kept as they are.
// `first` = number of the first placeholder used here (class $first, subject $first+1, date $first+2).
const freeSlots = (first) => `
  FROM timetable_slots ts
  WHERE ts.class_id = $${first} AND ts.subject_id = $${first + 1} AND ts."date" >= $${first + 2}::date
    AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)`;

export async function countFreeSlotsFrom(classId, subjectId, date, db) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS "n" ${freeSlots(1)}`, [classId, subjectId, date]);
  return Number(rows[0].n);
}

// Periods where `teacherId` already teaches another lesson at the same date + period (first 5).
export async function findTeacherClashes(teacherId, classId, subjectId, date, db) {
  const { rows } = await db.query(
    `SELECT to_char(ts."date", 'YYYY-MM-DD') AS "date", sl.period_number AS "period", c2.class_name AS "otherClass"
     FROM timetable_slots ts
     JOIN time_slots sl ON sl.slot_id = ts.slot_id
     JOIN timetable_slots other
       ON other.teacher_id = $1 AND other."date" = ts."date" AND other.slot_id = ts.slot_id
      AND other.timetable_slot_id <> ts.timetable_slot_id
     JOIN classes c2 ON c2.class_id = other.class_id
     WHERE ts.class_id = $2 AND ts.subject_id = $3 AND ts."date" >= $4::date
       AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)
     ORDER BY ts."date", sl.period_number
     LIMIT 5`,
    [teacherId, classId, subjectId, date],
  );
  return rows;
}

// No substitute teaching: the timetable teacher must match the assignment.
export async function moveFreeSlotsToTeacher(teacherId, classId, subjectId, date, db) {
  await db.query(`UPDATE timetable_slots SET teacher_id = $1 WHERE timetable_slot_id IN (SELECT ts.timetable_slot_id ${freeSlots(2)})`, [
    teacherId,
    classId,
    subjectId,
    date,
  ]);
}
