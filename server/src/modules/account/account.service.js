import bcrypt from 'bcryptjs';
import { pool } from '../../config/db.js';
import { badRequest, unauthorized } from '../../utils/AppError.js';
import { assertNewPassword, hashPassword } from '../../utils/password.js';
import { getNumberSetting } from '../../utils/settings.js';
import { detectImageType, saveFile } from '../../utils/storage.js';
import { signAccessToken } from '../../utils/token.js';

// The current school year is found by date (MOM-05: no is_current); between two years, the latest one that started.
async function currentSchoolYear() {
  const { rows } = await pool.query(
    `SELECT school_year_id AS id, year_name AS name FROM school_years
     WHERE start_date <= CURRENT_DATE ORDER BY start_date DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

async function studentInfo(userId, yearId) {
  const { rows } = await pool.query(
    'SELECT student_id, student_code AS "studentCode", dob, gender FROM students WHERE user_id = $1',
    [userId],
  );
  if (!rows.length) return null;
  const { student_id: studentId, ...student } = rows[0];
  const { rows: classes } = await pool.query(
    `SELECT c.class_name AS name, gl.grade_level_name AS "gradeLevel", ct.track_name AS track,
            ht.full_name AS "homeroomTeacher", e.nickname
     FROM class_enrollments e
     JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
     JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     JOIN class_tracks ct ON ct.track_id = c.track_id
     LEFT JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
     LEFT JOIN users ht ON ht.user_id = t.user_id
     WHERE e.student_id = $1 AND e.status = 'STUDYING' AND c.school_year_id = $2
     ORDER BY e.enrolled_at DESC LIMIT 1`,
    [studentId, yearId],
  );
  return { ...student, class: classes[0] ?? null };
}

async function teacherInfo(userId, yearId) {
  const { rows } = await pool.query(
    'SELECT teacher_id, teacher_code AS "teacherCode", department FROM teachers WHERE user_id = $1',
    [userId],
  );
  if (!rows.length) return null;
  const { teacher_id: teacherId, ...teacher } = rows[0];
  const { rows: subjects } = await pool.query(
    `SELECT s.subject_name AS name FROM teacher_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id
     WHERE ts.teacher_id = $1 AND s.deleted_at IS NULL ORDER BY s.subject_name`,
    [teacherId],
  );
  const { rows: homeroom } = await pool.query(
    `SELECT class_name AS name FROM classes
     WHERE homeroom_teacher_id = $1 AND school_year_id = $2 AND deleted_at IS NULL ORDER BY class_name`,
    [teacherId, yearId],
  );
  const { rows: teaching } = await pool.query(
    `SELECT c.class_name AS "className", s.subject_name AS "subjectName"
     FROM teaching_assignments ta
     JOIN classes c ON c.class_id = ta.class_id AND c.deleted_at IS NULL
     JOIN subjects s ON s.subject_id = ta.subject_id
     WHERE ta.teacher_id = $1 AND ta.deleted_at IS NULL AND c.school_year_id = $2
     ORDER BY c.class_name, s.subject_name`,
    [teacherId, yearId],
  );
  return {
    ...teacher,
    subjects: subjects.map((s) => s.name),
    homeroomClasses: homeroom.map((c) => c.name),
    teaching,
  };
}

async function parentInfo(userId, yearId) {
  const { rows } = await pool.query('SELECT parent_id, occupation, address FROM parents WHERE user_id = $1', [userId]);
  if (!rows.length) return null;
  const { parent_id: parentId, ...parent } = rows[0];
  const { rows: children } = await pool.query(
    `SELECT u.full_name AS "fullName", s.student_code AS "studentCode", sp.relationship_type AS relationship,
            cur.class_name AS "className"
     FROM student_parents sp
     JOIN students s ON s.student_id = sp.student_id
     JOIN users u ON u.user_id = s.user_id
     LEFT JOIN (
       SELECT e.student_id, c.class_name FROM class_enrollments e
       JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
       WHERE e.status = 'STUDYING' AND c.school_year_id = $1
     ) cur ON cur.student_id = s.student_id
     WHERE sp.parent_id = $2
     ORDER BY u.full_name`,
    [yearId, parentId],
  );
  return { ...parent, children };
}

// UC-04 View Profile: personal, school, class and role information of the signed-in user (all their roles).
export async function getProfile({ userId, roles, activeRole }) {
  const { rows } = await pool.query(
    `SELECT user_id AS id, username, full_name AS "fullName", email, phone, avatar_url AS "avatarUrl", status,
            created_at AS "createdAt"
     FROM users WHERE user_id = $1`,
    [userId],
  );
  if (!rows.length) throw unauthorized('AUTH_INVALID', 'Please sign in again.');
  const year = await currentSchoolYear();
  const yearId = year?.id ?? 0;
  const [student, teacher, parent] = await Promise.all([
    roles.includes('STUDENT') ? studentInfo(userId, yearId) : null,
    roles.includes('TEACHER') ? teacherInfo(userId, yearId) : null,
    roles.includes('PARENT') ? parentInfo(userId, yearId) : null,
  ]);
  const avatarMaxMb = await getNumberSetting('upload.max_file_mb', 10); // shown on SCR-04
  return { user: rows[0], roles, activeRole, schoolYear: year?.name ?? null, student, teacher, parent, avatarMaxMb };
}

// UC-05 Change Password: needs the current password; also ends the "temporary password" state of UC-01.
// Returns a fresh token because the old one still says mustChangePassword.
export async function changePassword({ user: claims, currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) {
    throw badRequest('MSG_REQUIRED', 'Please enter the current and the new password.');
  }
  const { rows } = await pool.query(
    `SELECT user_id, username, phone, password_hash FROM users WHERE user_id = $1 AND status = 'ACTIVE'`,
    [claims.userId],
  );
  const user = rows[0];
  if (!user) throw unauthorized('AUTH_INVALID', 'Please sign in again.');
  if (!(await bcrypt.compare(String(currentPassword), user.password_hash))) {
    throw badRequest('MSG_WRONG_CURRENT_PASSWORD', 'The current password is not correct.');
  }
  await assertNewPassword(newPassword, user);
  await pool.query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE user_id = $2', [
    await hashPassword(newPassword),
    user.user_id,
  ]);
  return {
    token: signAccessToken({ userId: claims.userId, roles: claims.roles, activeRole: claims.activeRole }),
  };
}

// UC-06 Change Avatar: JPEG / PNG / WebP up to upload.max_file_mb (checked by the upload middleware).
export async function changeAvatar({ userId, file }) {
  if (!file) throw badRequest('MSG_REQUIRED', 'Please choose an image.');
  const extension = detectImageType(file.buffer);
  if (!extension) throw badRequest('MSG_INVALID_IMAGE', 'Only JPG, PNG or WebP images are allowed.');
  const avatarUrl = await saveFile('avatars', file.buffer, extension);
  await pool.query('UPDATE users SET avatar_url = $1 WHERE user_id = $2', [avatarUrl, userId]);
  return { avatarUrl };
}
