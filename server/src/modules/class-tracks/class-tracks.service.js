import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';

// UC-26 Manage Class Types (SCR-70 "Loại lớp & số tiết"). A class type (class_tracks) belongs to one grade or to
// every grade (grade_level_id NULL) and is shared by every school year; its subjects and periods per week
// (track_subjects) are set per school year (business-rules §4).
// Agreed 01/11: every subject weight is 1 – track_subjects.weight is always written as 1.00 and no longer shown,
// so the year average of business-rules §11 is a plain average.

const conflict = (code, message) => new AppError(409, code, message);

const WEIGHT = '1.00';
// ASSUMPTION: periods per week is a whole number 1–10; business-rules give no range (agreed 27/10).
const PERIODS_MAX = 10;

function parseId(value, message) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('NOT_FOUND', message);
  return id;
}

// configured = the year has subjects set for a class type that is not deleted (rows of deleted types are kept).
// The year has grades = any grades row (even a cleared score) in one of its semesters. Then the subject lists lock
// (business-rules §4); periods per week can still change. The flag keeps its old name, weightsLocked.
// ASSUMPTION: the lock covers the whole year, not only the class types whose classes have grades (agreed 27/10).
const YEAR_SQL = `
  SELECT sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName",
         CURRENT_DATE > sy.end_date AS "ended",
         EXISTS (SELECT 1 FROM grades g
                 JOIN grade_components gc ON gc.component_id = g.component_id
                 JOIN semesters se ON se.semester_id = gc.semester_id
                 WHERE se.school_year_id = sy.school_year_id) AS "weightsLocked",
         EXISTS (SELECT 1 FROM track_subjects ts
                 JOIN class_tracks ct ON ct.track_id = ts.track_id AND ct.deleted_at IS NULL
                 JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
                 WHERE ts.school_year_id = sy.school_year_id) AS "configured"
  FROM school_years sy`;

// The requested year, or the current one by date (MOM-05) – the latest year that has started, else the first
// upcoming one. Null when no school year exists yet.
async function resolveYear(schoolYearId) {
  if (schoolYearId !== undefined && schoolYearId !== '') {
    const id = parseId(schoolYearId, 'School year not found.');
    const { rows } = await pool.query(`${YEAR_SQL} WHERE sy.school_year_id = $1`, [id]);
    if (!rows.length) throw notFound('NOT_FOUND', 'School year not found.');
    return rows[0];
  }
  const { rows } = await pool.query(
    `${YEAR_SQL}
     ORDER BY sy.start_date <= CURRENT_DATE DESC,
              CASE WHEN sy.start_date <= CURRENT_DATE THEN sy.start_date END DESC,
              sy.start_date
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

// Locks the year row for the rest of the transaction (two School Managers saving at once, grades arriving) and
// returns its flags. An ended year is read only, as in UC-20 / UC-21.
async function lockYear(client, schoolYearId) {
  const id = parseId(schoolYearId, 'School year not found.');
  await client.query('SELECT 1 FROM school_years WHERE school_year_id = $1 FOR UPDATE', [id]);
  const { rows } = await client.query(`${YEAR_SQL} WHERE sy.school_year_id = $1`, [id]);
  if (!rows.length) throw notFound('NOT_FOUND', 'School year not found.');
  if (rows[0].ended) throw conflict('MSG_SCHOOL_YEAR_ENDED', 'An ended school year cannot be changed.');
  return rows[0];
}

// The latest year before this one that has a configuration – what "copy from the previous year" copies.
async function findCopySource(year) {
  if (!year || year.configured) return null;
  const { rows } = await pool.query(
    `SELECT p.school_year_id AS "schoolYearId", p.year_name AS "yearName"
     FROM school_years p
     JOIN school_years cur ON cur.school_year_id = $1
     WHERE p.start_date < cur.start_date
       AND EXISTS (SELECT 1 FROM track_subjects ts
                   JOIN class_tracks ct ON ct.track_id = ts.track_id AND ct.deleted_at IS NULL
                   JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
                   WHERE ts.school_year_id = p.school_year_id)
     ORDER BY p.start_date DESC
     LIMIT 1`,
    [year.schoolYearId],
  );
  return rows[0] ?? null;
}

// A class type with its grade; gradeLevelId / gradeLevel are null for a type used by every grade.
const TRACK_COLUMNS = `ct.track_id AS "trackId", ct.track_name AS "trackName", ct.description,
            ct.grade_level_id AS "gradeLevelId", gl.grade_level_name AS "gradeLevel"`;
const TRACK_FROM = 'class_tracks ct LEFT JOIN grade_levels gl ON gl.grade_level_id = ct.grade_level_id';

// UC-26: every class type with, for the chosen year, its number of classes and configured subjects, grade by
// grade (types for every grade last). inUse = some class (any year) has this type, so it cannot be deleted.
// gradeLevelId = only the types usable for that grade (its own and the ones for every grade), for the class forms.
export async function listTracks({ schoolYearId, gradeLevelId }) {
  const schoolYear = await resolveYear(schoolYearId);
  const grade = gradeLevelId ? await assertGrade(pool, gradeLevelId) : null;
  const { rows: tracks } = await pool.query(
    `SELECT ${TRACK_COLUMNS},
            (SELECT COUNT(*) FROM classes c
             WHERE c.track_id = ct.track_id AND c.school_year_id = $1 AND c.deleted_at IS NULL) AS "classCount",
            (SELECT COUNT(*) FROM track_subjects ts
             JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
             WHERE ts.track_id = ct.track_id AND ts.school_year_id = $1) AS "subjectCount",
            EXISTS (SELECT 1 FROM classes c WHERE c.track_id = ct.track_id AND c.deleted_at IS NULL) AS "inUse"
     FROM ${TRACK_FROM}
     WHERE ct.deleted_at IS NULL
       AND ($2::bigint IS NULL OR ct.grade_level_id IS NULL OR ct.grade_level_id = $2)
     ORDER BY gl.grade_level_name NULLS LAST, ct.track_name`,
    [schoolYear?.schoolYearId ?? null, grade],
  );
  return { schoolYear, copySource: await findCopySource(schoolYear), tracks };
}

// The grade id when it exists (404 otherwise).
async function assertGrade(db, gradeLevelId) {
  const id = parseId(gradeLevelId, 'Grade not found.');
  const { rows } = await db.query('SELECT 1 FROM grade_levels WHERE grade_level_id = $1', [id]);
  if (!rows.length) throw notFound('NOT_FOUND', 'Grade not found.');
  return id;
}

// Grades (ids) of the classes (any year) that use a class type.
async function usedGradeIds(db, trackId) {
  const { rows } = await db.query(
    'SELECT DISTINCT grade_level_id AS "id" FROM classes WHERE track_id = $1 AND deleted_at IS NULL',
    [trackId],
  );
  return rows.map((r) => r.id);
}

async function loadTrack(db, id) {
  const { rows } = await db.query(
    `SELECT ${TRACK_COLUMNS},
            EXISTS (SELECT 1 FROM classes c WHERE c.track_id = ct.track_id AND c.deleted_at IS NULL) AS "inUse"
     FROM ${TRACK_FROM}
     WHERE ct.track_id = $1 AND ct.deleted_at IS NULL`,
    [id],
  );
  if (!rows.length) throw notFound('NOT_FOUND', 'Class type not found.');
  return rows[0];
}

// name = 1–100 characters (class_tracks.track_name), description optional, at most 255.
function validateTrack({ trackName, description }) {
  const name = typeof trackName === 'string' ? trackName.trim().replace(/\s+/g, ' ') : '';
  const desc = typeof description === 'string' ? description.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw badRequest('MSG_REQUIRED', 'Please enter the class type name.');
  if (name.length > 100) throw badRequest('MSG_TRACK_NAME_LENGTH', 'The class type name has at most 100 characters.');
  if (desc.length > 255) throw badRequest('MSG_TRACK_DESCRIPTION_LENGTH', 'The description has at most 255 characters.');
  return { name, desc: desc || null };
}

// Among class types that are not deleted, compared without case (patch_v0.3_class_track_grade.sql):
//   * a name is unique within one grade (NULL = every grade) – also enforced by uq_class_tracks_grade_name;
//   * a name is used either for every grade or per grade, never both, so "Khối A" is never two choices for one class.
// ASSUMPTION (proposed 02/11, to confirm with Quoc): the second rule.
async function assertNameFree(client, name, gradeLevelId, excludeId = null) {
  const { rows } = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM class_tracks WHERE deleted_at IS NULL AND lower(track_name) = lower($1)
               AND grade_level_id IS NOT DISTINCT FROM $2 AND ($3::bigint IS NULL OR track_id <> $3)) AS "taken",
       EXISTS (SELECT 1 FROM class_tracks WHERE deleted_at IS NULL AND lower(track_name) = lower($1)
               AND ($2::bigint IS NULL) <> (grade_level_id IS NULL) AND ($3::bigint IS NULL OR track_id <> $3)) AS "mixed"`,
    [name, gradeLevelId, excludeId],
  );
  if (rows[0].taken) throw conflict('MSG_TRACK_NAME_TAKEN', 'This grade already has a class type with this name.');
  if (rows[0].mixed) {
    throw conflict('MSG_TRACK_NAME_SCOPE', 'This name is already used for every grade or for a single grade.');
  }
}

function mapDuplicate(err) {
  if (err.code === '23505') return conflict('MSG_TRACK_NAME_TAKEN', 'This grade already has a class type with this name.');
  return err;
}

// The grades a new class type is created for: [] or missing = one type for every grade.
async function gradeIds(db, gradeLevelIds) {
  if (gradeLevelIds === undefined || gradeLevelIds === null) return [null];
  if (!Array.isArray(gradeLevelIds)) throw badRequest('MSG_REQUIRED', 'Please send the list of grades.');
  if (!gradeLevelIds.length) return [null];
  const ids = [];
  for (const id of gradeLevelIds) ids.push(await assertGrade(db, id));
  if (new Set(ids).size !== ids.length) throw badRequest('MSG_TRACK_GRADE_DUPLICATE', 'A grade is listed twice.');
  return ids.sort((a, b) => a - b);
}

// UC-26 create a class type – one per chosen grade ("Khối A" for grades 10 and 11 = two types, each with its own
// subjects) or one for every grade. Their subjects are set per school year afterwards. Returns { tracks }.
export async function createTrack(input) {
  const { name, desc } = validateTrack(input);
  const ids = await withTransaction(async (client) => {
    await client.query('LOCK TABLE class_tracks IN SHARE ROW EXCLUSIVE MODE'); // written rarely
    const created = [];
    for (const grade of await gradeIds(client, input.gradeLevelIds)) {
      await assertNameFree(client, name, grade);
      const { rows } = await client.query(
        `INSERT INTO class_tracks (track_name, description, grade_level_id) VALUES ($1, $2, $3)
         RETURNING track_id AS "trackId"`,
        [name, desc, grade],
      );
      created.push(rows[0].trackId);
    }
    return created;
  }).catch((err) => {
    throw mapDuplicate(err);
  });
  const tracks = [];
  for (const id of ids) tracks.push(await loadTrack(pool, id));
  return { tracks };
}

// UC-26 rename a class type or change its grade. The name is only a label, so it can change even when classes use
// the type; the grade can only become one that every class using the type has (or every grade).
export async function updateTrack(idParam, input) {
  const id = parseId(idParam, 'Class type not found.');
  const { name, desc } = validateTrack(input);
  await withTransaction(async (client) => {
    await client.query('LOCK TABLE class_tracks IN SHARE ROW EXCLUSIVE MODE');
    const track = await loadTrack(client, id);
    let grade = track.gradeLevelId;
    if (input.gradeLevelId !== undefined) grade = input.gradeLevelId ? await assertGrade(client, input.gradeLevelId) : null;
    if (grade && grade !== track.gradeLevelId && (await usedGradeIds(client, id)).some((g) => g !== grade)) {
      throw conflict('MSG_TRACK_GRADE_IN_USE', 'Classes of another grade use this class type.');
    }
    await assertNameFree(client, name, grade, id);
    await client.query(
      'UPDATE class_tracks SET track_name = $2, description = $3, grade_level_id = $4 WHERE track_id = $1',
      [id, name, desc, grade],
    );
  }).catch((err) => {
    throw mapDuplicate(err);
  });
  return loadTrack(pool, id);
}

// UC-26 delete a class type (soft). ASSUMPTION: blocked while any class that is not deleted uses it, whatever the
// year (classes.track_id is NOT NULL), agreed 27/10. Its track_subjects rows are kept for history.
export async function deleteTrack(idParam) {
  const id = parseId(idParam, 'Class type not found.');
  await withTransaction(async (client) => {
    await client.query('LOCK TABLE class_tracks IN SHARE ROW EXCLUSIVE MODE');
    await client.query('SELECT 1 FROM class_tracks WHERE track_id = $1 FOR UPDATE', [id]);
    const track = await loadTrack(client, id);
    if (track.inUse) throw conflict('MSG_TRACK_IN_USE', 'Classes use this class type, so it cannot be deleted.');
    await client.query('UPDATE class_tracks SET deleted_at = NOW() WHERE track_id = $1', [id]);
  });
}

// UC-26: every subject of the school with, for the chosen year, whether this class type studies it and its periods
// per week.
export async function getTrackSubjects(idParam, { schoolYearId }) {
  const id = parseId(idParam, 'Class type not found.');
  const track = await loadTrack(pool, id);
  const schoolYear = await resolveYear(schoolYearId);
  const { rows: subjects } = await pool.query(
    `SELECT s.subject_id AS "subjectId", s.subject_code AS "subjectCode", s.subject_name AS "subjectName",
            ts.track_subject_id IS NOT NULL AS "configured", ts.periods_per_week AS "periodsPerWeek"
     FROM subjects s
     LEFT JOIN track_subjects ts
       ON ts.subject_id = s.subject_id AND ts.track_id = $1 AND ts.school_year_id = $2
     WHERE s.deleted_at IS NULL
     ORDER BY s.subject_id`,
    [id, schoolYear?.schoolYearId ?? null],
  );
  return { track, schoolYear, copySource: await findCopySource(schoolYear), subjects };
}

// One row of the save body -> { subjectId, periods }. A weight sent by an older client is ignored.
function validateItem(item) {
  const subjectId = Number(item?.subjectId);
  if (!Number.isSafeInteger(subjectId) || subjectId <= 0) throw notFound('NOT_FOUND', 'Subject not found.');
  const periods = Number(item.periodsPerWeek);
  if (!Number.isInteger(periods) || periods < 1 || periods > PERIODS_MAX) {
    throw badRequest('MSG_TRACK_PERIODS_RANGE', `Periods per week is a whole number from 1 to ${PERIODS_MAX}.`);
  }
  return { subjectId, periods };
}

// UC-26 save the subjects of a class type for one school year. `items` is the full list the type studies that
// year: rows missing from it are removed. Once the year has grades only periods per week may change – adding or
// removing a subject would change the grade books and year averages (business-rules §11).
// ASSUMPTION (needs team lead approval): removing a subject hard-deletes its track_subjects row, which is not on
// the hard-delete list in CLAUDE.md; allowed only while the year has no grades and has not ended (agreed 27/10).
export async function saveTrackSubjects(idParam, { schoolYearId, items }) {
  const id = parseId(idParam, 'Class type not found.');
  if (schoolYearId === undefined || schoolYearId === null || schoolYearId === '') {
    throw badRequest('MSG_REQUIRED', 'Please choose a school year.');
  }
  if (!Array.isArray(items)) throw badRequest('MSG_REQUIRED', 'Please send the list of subjects.');
  const wanted = items.map(validateItem);
  const ids = wanted.map((w) => w.subjectId);
  if (new Set(ids).size !== ids.length) throw badRequest('MSG_TRACK_SUBJECT_DUPLICATE', 'A subject is listed twice.');

  await withTransaction(async (client) => {
    const year = await lockYear(client, schoolYearId);
    await client.query('SELECT 1 FROM class_tracks WHERE track_id = $1 FOR UPDATE', [id]);
    await loadTrack(client, id);

    const { rows: found } = await client.query(
      'SELECT COUNT(*) AS "count" FROM subjects WHERE subject_id = ANY($1::bigint[]) AND deleted_at IS NULL',
      [ids],
    );
    if (found[0].count !== ids.length) throw notFound('NOT_FOUND', 'Subject not found.');

    if (year.weightsLocked) {
      const { rows: current } = await client.query(
        'SELECT subject_id AS "subjectId" FROM track_subjects WHERE track_id = $1 AND school_year_id = $2',
        [id, year.schoolYearId],
      );
      const before = new Set(current.map((r) => r.subjectId));
      if (current.length !== wanted.length || wanted.some((w) => !before.has(w.subjectId))) {
        throw conflict('MSG_TRACK_WEIGHTS_LOCKED', 'This school year has grades, so subjects cannot be added or removed.');
      }
    }

    await client.query(
      `DELETE FROM track_subjects
       WHERE track_id = $1 AND school_year_id = $2 AND NOT (subject_id = ANY($3::bigint[]))`,
      [id, year.schoolYearId, ids],
    );
    if (wanted.length) {
      await client.query(
        `INSERT INTO track_subjects (track_id, subject_id, school_year_id, weight, periods_per_week)
         SELECT $1, x.subject_id, $2, $5::numeric, x.periods
         FROM unnest($3::bigint[], $4::int[]) AS x(subject_id, periods)
         ON CONFLICT (track_id, subject_id, school_year_id)
         DO UPDATE SET weight = EXCLUDED.weight, periods_per_week = EXCLUDED.periods_per_week`,
        [id, year.schoolYearId, ids, wanted.map((w) => w.periods), WEIGHT],
      );
    }
  });
  return getTrackSubjects(id, { schoolYearId });
}

// UC-26 copy every class type's subjects and periods from one year to another ("copied from the previous
// year by default", business-rules §4). The target must have no configuration yet, so nothing in use is overwritten.
// Deleted class types and subjects are skipped. Returns how many rows were copied.
export async function copyYear({ fromSchoolYearId, toSchoolYearId }) {
  if (!fromSchoolYearId || !toSchoolYearId) throw badRequest('MSG_REQUIRED', 'Please choose both school years.');
  const fromId = parseId(fromSchoolYearId, 'School year not found.');
  const toId = parseId(toSchoolYearId, 'School year not found.');
  if (fromId === toId) throw badRequest('MSG_TRACK_COPY_SAME_YEAR', 'Choose two different school years.');

  return withTransaction(async (client) => {
    const target = await lockYear(client, toId);
    if (target.configured) {
      throw conflict('MSG_TRACK_CONFIG_EXISTS', 'This school year already has class type settings.');
    }
    const { rows: source } = await client.query('SELECT 1 FROM school_years WHERE school_year_id = $1', [fromId]);
    if (!source.length) throw notFound('NOT_FOUND', 'School year not found.');
    const { rowCount } = await client.query(
      `INSERT INTO track_subjects (track_id, subject_id, school_year_id, weight, periods_per_week)
       SELECT ts.track_id, ts.subject_id, $2, 1.00, ts.periods_per_week
       FROM track_subjects ts
       JOIN class_tracks ct ON ct.track_id = ts.track_id AND ct.deleted_at IS NULL
       JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
       WHERE ts.school_year_id = $1`,
      [fromId, toId],
    );
    if (!rowCount) throw badRequest('MSG_TRACK_COPY_EMPTY', 'The source school year has no class type settings.');
    return { copied: rowCount };
  });
}
