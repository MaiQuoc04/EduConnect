import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';

// UC-26 Manage Class Types (SCR-71). A class type (class_tracks) is shared by every school year; its subjects with
// their weight and periods per week (track_subjects) are set per school year (business-rules §4).

const conflict = (code, message) => new AppError(409, code, message);

// ASSUMPTION: a weight is 0.01–10 with at most 2 decimals (DECIMAL(5,2)) and periods per week a whole number
// 1–10; business-rules give no range (agreed 27/10).
const WEIGHT_MAX = 10;
const PERIODS_MAX = 10;

function parseId(value, message) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('NOT_FOUND', message);
  return id;
}

// configured = the year has subjects set for a class type that is not deleted (rows of deleted types are kept).
// The year has grades = any grades row (even a cleared score) in one of its semesters. Then the weights lock
// (business-rules §4); periods per week can still change.
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

// UC-26: every class type with, for the chosen year, its number of classes and configured subjects.
// inUse = some class (any year) has this type, so it cannot be deleted.
export async function listTracks({ schoolYearId }) {
  const schoolYear = await resolveYear(schoolYearId);
  const { rows: tracks } = await pool.query(
    `SELECT ct.track_id AS "trackId", ct.track_name AS "trackName", ct.description,
            (SELECT COUNT(*) FROM classes c
             WHERE c.track_id = ct.track_id AND c.school_year_id = $1 AND c.deleted_at IS NULL) AS "classCount",
            (SELECT COUNT(*) FROM track_subjects ts
             JOIN subjects s ON s.subject_id = ts.subject_id AND s.deleted_at IS NULL
             WHERE ts.track_id = ct.track_id AND ts.school_year_id = $1) AS "subjectCount",
            EXISTS (SELECT 1 FROM classes c WHERE c.track_id = ct.track_id AND c.deleted_at IS NULL) AS "inUse"
     FROM class_tracks ct
     WHERE ct.deleted_at IS NULL
     ORDER BY ct.track_name`,
    [schoolYear?.schoolYearId ?? null],
  );
  return { schoolYear, copySource: await findCopySource(schoolYear), tracks };
}

async function loadTrack(db, id) {
  const { rows } = await db.query(
    `SELECT ct.track_id AS "trackId", ct.track_name AS "trackName", ct.description,
            EXISTS (SELECT 1 FROM classes c WHERE c.track_id = ct.track_id AND c.deleted_at IS NULL) AS "inUse"
     FROM class_tracks ct
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

// track_name is UNIQUE over every row, deleted ones included; compare without case so "khối a" = "Khối A".
async function assertNameFree(client, name, excludeId = null) {
  const { rows } = await client.query(
    `SELECT EXISTS (SELECT 1 FROM class_tracks WHERE lower(track_name) = lower($1)
                    AND ($2::bigint IS NULL OR track_id <> $2)) AS "taken"`,
    [name, excludeId],
  );
  if (rows[0].taken) throw conflict('MSG_TRACK_NAME_TAKEN', 'This class type name is already used.');
}

function mapDuplicate(err) {
  if (err.code === '23505') return conflict('MSG_TRACK_NAME_TAKEN', 'This class type name is already used.');
  return err;
}

// UC-26 create a class type. Its subjects are set per school year afterwards.
export async function createTrack(input) {
  const { name, desc } = validateTrack(input);
  const id = await withTransaction(async (client) => {
    await client.query('LOCK TABLE class_tracks IN SHARE ROW EXCLUSIVE MODE'); // written rarely
    await assertNameFree(client, name);
    const { rows } = await client.query(
      'INSERT INTO class_tracks (track_name, description) VALUES ($1, $2) RETURNING track_id AS "trackId"',
      [name, desc],
    );
    return rows[0].trackId;
  }).catch((err) => {
    throw mapDuplicate(err);
  });
  return loadTrack(pool, id);
}

// UC-26 rename a class type. The name is only a label, so it can change even when classes use the type.
export async function updateTrack(idParam, input) {
  const id = parseId(idParam, 'Class type not found.');
  const { name, desc } = validateTrack(input);
  await withTransaction(async (client) => {
    await client.query('LOCK TABLE class_tracks IN SHARE ROW EXCLUSIVE MODE');
    await loadTrack(client, id);
    await assertNameFree(client, name, id);
    await client.query('UPDATE class_tracks SET track_name = $2, description = $3 WHERE track_id = $1', [id, name, desc]);
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

// UC-26: every subject of the school with, for the chosen year, whether this class type studies it and its weight
// and periods per week. weight stays a string ("2.00").
export async function getTrackSubjects(idParam, { schoolYearId }) {
  const id = parseId(idParam, 'Class type not found.');
  const track = await loadTrack(pool, id);
  const schoolYear = await resolveYear(schoolYearId);
  const { rows: subjects } = await pool.query(
    `SELECT s.subject_id AS "subjectId", s.subject_code AS "subjectCode", s.subject_name AS "subjectName",
            ts.track_subject_id IS NOT NULL AS "configured", ts.weight, ts.periods_per_week AS "periodsPerWeek"
     FROM subjects s
     LEFT JOIN track_subjects ts
       ON ts.subject_id = s.subject_id AND ts.track_id = $1 AND ts.school_year_id = $2
     WHERE s.deleted_at IS NULL
     ORDER BY s.subject_id`,
    [id, schoolYear?.schoolYearId ?? null],
  );
  return { track, schoolYear, copySource: await findCopySource(schoolYear), subjects };
}

// One row of the save body -> { subjectId, weight (string with 2 decimals), periods }.
function validateItem(item) {
  const subjectId = Number(item?.subjectId);
  if (!Number.isSafeInteger(subjectId) || subjectId <= 0) throw notFound('NOT_FOUND', 'Subject not found.');
  const rawWeight = typeof item.weight === 'number' ? String(item.weight) : String(item.weight ?? '').trim();
  const weight = Number(rawWeight);
  if (!/^\d+(\.\d{1,2})?$/.test(rawWeight) || weight <= 0 || weight > WEIGHT_MAX) {
    throw badRequest('MSG_TRACK_WEIGHT_RANGE', `A weight is a number above 0 and at most ${WEIGHT_MAX}, 2 decimals.`);
  }
  const periods = Number(item.periodsPerWeek);
  if (!Number.isInteger(periods) || periods < 1 || periods > PERIODS_MAX) {
    throw badRequest('MSG_TRACK_PERIODS_RANGE', `Periods per week is a whole number from 1 to ${PERIODS_MAX}.`);
  }
  return { subjectId, weight: weight.toFixed(2), periods };
}

// UC-26 save the subjects of a class type for one school year. `items` is the full list the type studies that
// year: rows missing from it are removed. Once the year has grades only periods per week may change – adding,
// removing or re-weighting a subject would change the year averages (business-rules §11).
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

    const { rows: current } = await client.query(
      `SELECT subject_id AS "subjectId", weight FROM track_subjects WHERE track_id = $1 AND school_year_id = $2`,
      [id, year.schoolYearId],
    );
    if (year.weightsLocked) {
      const before = new Map(current.map((r) => [r.subjectId, Number(r.weight)]));
      const changed =
        current.length !== wanted.length ||
        wanted.some((w) => !before.has(w.subjectId) || before.get(w.subjectId) !== Number(w.weight));
      if (changed) {
        throw conflict('MSG_TRACK_WEIGHTS_LOCKED', 'This school year has grades, so subjects and weights cannot change.');
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
         SELECT $1, x.subject_id, $2, x.weight, x.periods
         FROM unnest($3::bigint[], $4::numeric[], $5::int[]) AS x(subject_id, weight, periods)
         ON CONFLICT (track_id, subject_id, school_year_id)
         DO UPDATE SET weight = EXCLUDED.weight, periods_per_week = EXCLUDED.periods_per_week`,
        [id, year.schoolYearId, ids, wanted.map((w) => w.weight), wanted.map((w) => w.periods)],
      );
    }
  });
  return getTrackSubjects(id, { schoolYearId });
}

// UC-26 copy every class type's subjects, weights and periods from one year to another ("copied from the previous
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
       SELECT ts.track_id, ts.subject_id, $2, ts.weight, ts.periods_per_week
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
