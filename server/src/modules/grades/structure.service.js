import { pool, withTransaction } from '../../config/db.js';
import { badRequest } from '../../utils/AppError.js';
import { foldVietnamese } from '../../utils/search.js';
import {
  conflict,
  loadComponents,
  loadGradeLevel,
  loadSemester,
  loadSubject,
  structureLocked,
} from './grades.scope.js';

// FE-11 (owner: Linh) – UC-81 Configure Grade Structure, UC-82 Copy Grade Structure. School Manager only (routes).
// A structure = the components of one subject × grade level × semester: name, weight (per-score coefficient, see
// grades.calc.js) and score_count (how many scores, e.g. regular tests = 4). It locks once it has grades.

// ASSUMPTION (FE-11 owner, 10/11/2026): limits that keep the grade book usable – at most 10 components, 1–10 scores
// each, weight > 0 and ≤ 100 with at most 2 decimals (DECIMAL(5,2)).
const MAX_COMPONENTS = 10;
const MAX_SCORE_COUNT = 10;

// SCR-25 list: every subject with, for this grade level and semester, whether it is taught in that grade (a class type
// of the grade, or one for every grade, has it in the school year – FE-04 track_subjects), its component count and
// whether its structure is locked.
export async function listStructures({ semesterId, gradeLevelId }) {
  const semester = await loadSemester(pool, semesterId);
  const grade = await loadGradeLevel(pool, gradeLevelId);
  const { rows } = await pool.query(
    `SELECT s.subject_id AS "subjectId", s.subject_code AS "subjectCode", s.subject_name AS "subjectName",
            EXISTS (SELECT 1 FROM track_subjects ts JOIN class_tracks ct ON ct.track_id = ts.track_id
                    WHERE ts.subject_id = s.subject_id AND ts.school_year_id = $3 AND ct.deleted_at IS NULL
                      AND (ct.grade_level_id IS NULL OR ct.grade_level_id = $2)) AS "taught",
            (SELECT COUNT(*) FROM grade_components gc
             WHERE gc.subject_id = s.subject_id AND gc.grade_level_id = $2 AND gc.semester_id = $1)::int AS "componentCount",
            EXISTS (SELECT 1 FROM grades g JOIN grade_components gc ON gc.component_id = g.component_id
                    WHERE gc.subject_id = s.subject_id AND gc.grade_level_id = $2 AND gc.semester_id = $1) AS "locked"
     FROM subjects s
     WHERE s.deleted_at IS NULL
     ORDER BY 4 DESC, s.subject_name COLLATE "vi-VN-x-icu"`,
    [semester.semesterId, grade.gradeLevelId, semester.schoolYearId],
  );
  return { semester, gradeLevel: grade, subjects: rows };
}

export async function getStructure({ semesterId, gradeLevelId, subjectId }) {
  const semester = await loadSemester(pool, semesterId);
  const grade = await loadGradeLevel(pool, gradeLevelId);
  const subject = await loadSubject(pool, subjectId);
  const components = await loadComponents(pool, subject.subjectId, grade.gradeLevelId, semester.semesterId);
  const locked = await structureLocked(pool, subject.subjectId, grade.gradeLevelId, semester.semesterId);
  return { semester, gradeLevel: grade, subject, components, locked };
}

// Checks the components sent by the form. Returns the cleaned list or throws MSG_STRUCTURE_INVALID with one entry
// per row ({ index, field, code }).
function readComponents(body) {
  const list = Array.isArray(body?.components) ? body.components : null;
  if (!list) throw badRequest('MSG_STRUCTURE_INVALID', 'Components are required.', { rows: [{ index: -1, code: 'EMPTY' }] });
  const errors = [];
  if (!list.length) errors.push({ index: -1, code: 'EMPTY' });
  if (list.length > MAX_COMPONENTS) errors.push({ index: -1, code: 'TOO_MANY', max: MAX_COMPONENTS });
  const seen = new Map();
  const cleaned = list.map((c, index) => {
    const name = typeof c?.name === 'string' ? c.name.trim().replace(/\s+/g, ' ') : '';
    const weightText = String(c?.weight ?? '').trim().replace(',', '.');
    const weight = Number(weightText);
    const scoreCount = Number(c?.scoreCount);
    if (!name) errors.push({ index, field: 'name', code: 'REQUIRED' });
    else if (name.length > 100) errors.push({ index, field: 'name', code: 'TOO_LONG' });
    else {
      const key = foldVietnamese(name);
      if (seen.has(key)) errors.push({ index, field: 'name', code: 'DUPLICATE' });
      seen.set(key, index);
    }
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(weightText) || !(weight > 0) || weight > 100) {
      errors.push({ index, field: 'weight', code: 'INVALID' });
    }
    if (!Number.isInteger(scoreCount) || scoreCount < 1 || scoreCount > MAX_SCORE_COUNT) {
      errors.push({ index, field: 'scoreCount', code: 'INVALID' });
    }
    return { name, weight, scoreCount };
  });
  if (errors.length) throw badRequest('MSG_STRUCTURE_INVALID', 'Some components are not valid.', { rows: errors });
  return cleaned;
}

// Replaces the components of one structure. Called inside a transaction; refuses a locked structure.
// ASSUMPTION (FE-11 owner, 10/11/2026, to confirm with the team lead): grade_components has no deleted_at, so the
// old components are hard deleted. This only happens while the structure has no grades (no grades row points to
// them); it is configuration like track_subjects (business-rules §14) – to add to the hard-delete list.
async function replaceComponents(client, { subjectId, gradeLevelId, semesterId }, components) {
  // Serialise with grade entry: a teacher saving the first grade at the same moment waits for this transaction.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('grade-structure:' || $1 || ':' || $2 || ':' || $3))", [
    String(subjectId),
    String(gradeLevelId),
    String(semesterId),
  ]);
  if (await structureLocked(client, subjectId, gradeLevelId, semesterId)) {
    throw conflict('MSG_STRUCTURE_LOCKED', 'This grade structure already has grades and can no longer be changed.');
  }
  await client.query('DELETE FROM grade_components WHERE subject_id = $1 AND grade_level_id = $2 AND semester_id = $3', [
    subjectId,
    gradeLevelId,
    semesterId,
  ]);
  await client.query(
    `INSERT INTO grade_components (subject_id, grade_level_id, semester_id, component_name, weight, score_count)
     SELECT $1, $2, $3, c.name, c.weight, c.score_count
     FROM unnest($4::text[], $5::numeric[], $6::int[]) WITH ORDINALITY AS c(name, weight, score_count, ord)
     ORDER BY c.ord`,
    [
      subjectId,
      gradeLevelId,
      semesterId,
      components.map((c) => c.name),
      components.map((c) => c.weight),
      components.map((c) => c.scoreCount),
    ],
  );
}

// UC-81 Configure Grade Structure.
export async function saveStructure({ semesterId, gradeLevelId, subjectId }, body) {
  const components = readComponents(body);
  const semester = await loadSemester(pool, semesterId);
  const grade = await loadGradeLevel(pool, gradeLevelId);
  const subject = await loadSubject(pool, subjectId);
  if (semester.yearEnded) throw conflict('MSG_YEAR_ENDED', 'This school year has ended.');
  const key = { subjectId: subject.subjectId, gradeLevelId: grade.gradeLevelId, semesterId: semester.semesterId };
  await withTransaction((client) => replaceComponents(client, key, components));
  return getStructure({ semesterId, gradeLevelId, subjectId });
}

// UC-82 Copy Grade Structure: the shown structure → one or several subjects of a semester × grade level, each an
// independent copy (later edits of one do not change the others). Each target's components are replaced.
// `to.subjectIds` lists the subjects (`to.subjectId` = one subject, as before). All or nothing, in one transaction:
// if any target already has grades the whole copy is refused (MSG_STRUCTURE_LOCKED) and nothing changes.
// ASSUMPTION (FE-11 owner, 14/11/2026): at most 50 subjects per copy (a grade has about 15).
const MAX_COPY_TARGETS = 50;

function readSubjectIds(to) {
  const raw = Array.isArray(to.subjectIds) ? to.subjectIds : to.subjectId !== undefined ? [to.subjectId] : [];
  const ids = [...new Set(raw.map((v) => Number(v)))];
  if (!ids.length || ids.length > MAX_COPY_TARGETS || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw badRequest('MSG_COPY_TARGETS', `Choose 1 to ${MAX_COPY_TARGETS} subjects to copy to.`);
  }
  return ids.sort((x, y) => x - y); // a fixed order of the advisory locks, so two copies cannot deadlock
}

export async function copyStructure(body) {
  const from = body?.from ?? {};
  const to = body?.to ?? {};
  const fromSemester = await loadSemester(pool, from.semesterId);
  const fromGrade = await loadGradeLevel(pool, from.gradeLevelId);
  const fromSubject = await loadSubject(pool, from.subjectId);
  const toSemester = await loadSemester(pool, to.semesterId);
  const toGrade = await loadGradeLevel(pool, to.gradeLevelId);
  const targets = [];
  for (const id of readSubjectIds(to)) targets.push(await loadSubject(pool, id));
  if (
    fromSemester.semesterId === toSemester.semesterId &&
    fromGrade.gradeLevelId === toGrade.gradeLevelId &&
    targets.some((t) => t.subjectId === fromSubject.subjectId)
  ) {
    throw badRequest('MSG_COPY_SAME', 'Choose a different semester, grade level or subject to copy to.');
  }
  if (toSemester.yearEnded) throw conflict('MSG_YEAR_ENDED', 'This school year has ended.');
  const components = await loadComponents(pool, fromSubject.subjectId, fromGrade.gradeLevelId, fromSemester.semesterId);
  if (!components.length) throw badRequest('MSG_STRUCTURE_EMPTY', 'The structure to copy has no components.');
  await withTransaction(async (client) => {
    for (const t of targets) {
      const key = { subjectId: t.subjectId, gradeLevelId: toGrade.gradeLevelId, semesterId: toSemester.semesterId };
      await replaceComponents(client, key, components);
    }
  });
  return {
    semesterId: toSemester.semesterId,
    gradeLevelId: toGrade.gradeLevelId,
    subjectIds: targets.map((t) => t.subjectId),
    copied: targets.length,
  };
}
