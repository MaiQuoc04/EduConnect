import { pool } from '../../config/db.js';
import { badRequest } from '../../utils/AppError.js';
import { tracksOverLimits } from '../class-tracks/class-tracks.service.js';
import { classesOverSize } from '../classes/classSize.js';
import * as service from './schoolSettings.service.js';

// School Manager settings (Dung, 21/11/2026). Controllers check the request, call the service and send the result.

// GET /api/v1/school-settings – the values in force (built-in defaults while the table is missing, with ready: false)
export async function get(req, res) {
  res.json(await service.getSettings());
}

// PUT /api/v1/school-settings { teaching?: { teacherMaxWeek, classMaxDay, classMaxWeek, subjectMaxWeek },
// classes?: { warnStudents, maxStudents }, attendance?: { editDeadlineTime }, stamp }
export async function update(req, res) {
  const values = service.checkBody(req.body);
  const stamp = typeof req.body?.stamp === 'string' ? req.body.stamp : '';
  res.json(await service.updateSettings({ values, stamp }, req.user, req.ip));
}

// GET /api/v1/school-settings/impact?maxStudents=&subjectMaxWeek=&classMaxWeek= (FE-04, 27/11/2026) – what is already
// above the values the School Manager is about to save, in school years that have not ended (shown before lowering a
// limit; nothing is changed: the classes keep their students, the class types their periods).
// -> { classes: [{ classId, className, yearName, students }], subjects: [...], tracks: [...] } (empty lists for a
// value left out).
export async function impact(req, res) {
  const read = (name) => {
    const raw = req.query[name];
    if (raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 1000) throw badRequest('MSG_INVALID_PARAM', `Invalid ${name}.`, { field: name });
    return n;
  };
  const maxStudents = read('maxStudents');
  const subjectMaxWeek = read('subjectMaxWeek');
  const classMaxWeek = read('classMaxWeek');
  const classes = maxStudents === null ? [] : await classesOverSize(pool, maxStudents);
  const { subjects, tracks } = subjectMaxWeek === null && classMaxWeek === null
    ? { subjects: [], tracks: [] }
    : await tracksOverLimits(pool, { subjectMaxWeek: subjectMaxWeek ?? 1000, classMaxWeek: classMaxWeek ?? 100000 });
  res.json({ classes, subjects, tracks });
}
