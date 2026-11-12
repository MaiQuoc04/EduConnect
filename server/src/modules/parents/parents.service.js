import { pool, withTransaction } from '../../config/db.js';
import { notFound } from '../../utils/AppError.js';
import { vietnameseNameOrder } from '../../utils/nameSort.js';
import { normalizePhone } from '../../utils/phone.js';
import { containsPattern, escapeLike, VI_TRANSLATE } from '../../utils/search.js';
// FE-02 (merged): the "current class of a student" rule of UC-07 / UC-08, reused, not written a second time.
import { findCurrentEnrollments } from '../students/students.service.js';

// FE-14 Parent Management (owner: Anh). SQL lives here; the controller validates the input first.
// Parent records only: linking / unlinking children is UC-13 (FE-02), creating / locking / resetting parent accounts
// is FE-13 (business-rules §2). Both reads here are not logged (business-rules §13).
//
// Schema v0.3: users, parents, students and student_parents have no deleted_at. Accounts are never deleted, only
// LOCKED (business-rules §3), so LOCKED parents are listed too. address is users.address (parents.address was
// dropped on 28/10/2026); occupation stays parents.occupation.
//
// A "parent" is a parents row whose account has the PARENT role, as UC-13 linkParent and the parent lookup check.
// An account without the role never shows up here, so the API does not reveal that another kind of account exists.
const HAS_PARENT_ROLE = `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                                 WHERE ur.user_id = u.user_id AND r.role_code = 'PARENT')`;

// Something that looks like a phone number ("0977000003", "+84 977 000 003", "0977.000.003"); same test as
// normalizeSignInName in utils/phone.js.
const PHONE_LIKE_RE = /^\+?[\d\s.-]+$/;

/**
 * WHERE conditions of the UC-104 filters (aliases: u = users, p = parents). Pushes values onto params.
 * @param {{ q?: string, hasChildren?: 'yes'|'no', accountStatus?: string }} filters
 */
function buildParentFilter({ q, hasChildren, accountStatus }, params) {
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const conditions = [HAS_PARENT_ROLE];
  if (q) {
    // ASSUMPTION: q is either a phone number or a name, never both. A phone is how a parent is identified
    // (business-rules §3), so text made only of digits / spaces / dots / dashes with an optional leading + is
    // normalised with utils/phone.js and matched as "contains" on users.phone (a full number finds exactly one
    // parent; part of a number such as "000003" works too). Anything else is a name search, "contains", ignoring
    // case and accents, % and _ literal (business-rules §16, utils/search.js). Names never contain digits, so a
    // name search on digits would find nothing anyway.
    if (PHONE_LIKE_RE.test(q) && /\d/.test(q)) { // "-" or "." alone is not a phone: name search
      conditions.push(`u.phone LIKE ${add(`%${escapeLike(normalizePhone(q))}%`)}`);
    } else {
      const p = add(containsPattern(q));
      const from = add(VI_TRANSLATE.from);
      const to = add(VI_TRANSLATE.to);
      conditions.push(`lower(translate(u.full_name, ${from}, ${to})) LIKE ${p}`);
    }
  }
  const hasLink = 'EXISTS (SELECT 1 FROM student_parents sp WHERE sp.parent_id = p.parent_id)';
  if (hasChildren === 'yes') conditions.push(hasLink);
  if (hasChildren === 'no') conditions.push(`NOT ${hasLink}`);
  if (accountStatus) conditions.push(`u.status = ${add(accountStatus)}`);
  return conditions.join(' AND ');
}

// --- UC-104 ----------------------------------------------------------------------------------------------------

// UC-104 View Parent List (School Manager), SCR-69: search by name or phone, filter by "has linked children" and
// account status, sorted the Vietnamese way (business-rules §16). Paged like UC-07: { items, page, pageSize, total };
// a page past the end gives items = []. An empty list is a normal result (the UI shows MSG01).
// email / phone are returned because only School Manager calls this (business-rules §6, permissions note 2).
//
// childrenSummary: the linked children, oldest link first, as [{ studentId, studentCode, fullName }], so SCR-69
// can show "who are the children" without one request per row. The subquery runs only for the rows of the page
// (a parent has few children; there is no limit per parent, business-rules §3). The client decides how many to show.
export async function listParents({ q, hasChildren, accountStatus, page, pageSize }) {
  const params = [];
  const where = buildParentFilter({ q, hasChildren, accountStatus }, params);
  const from = `parents p JOIN users u ON u.user_id = p.user_id WHERE ${where}`;

  // One after the other: the Supabase Free pooler allows DB_POOL_MAX=3 per developer (README §6).
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS total FROM ${from}`, params);
  const { rows: items } = await pool.query(
    `SELECT p.parent_id AS "parentId", u.user_id AS "userId", u.full_name AS "fullName",
            u.avatar_url AS "avatarUrl", u.phone, u.email, p.occupation, u.address, u.status AS "accountStatus",
            (SELECT COUNT(*) FROM student_parents sp WHERE sp.parent_id = p.parent_id) AS "childrenCount",
            COALESCE((SELECT json_agg(json_build_object('studentId', s.student_id, 'studentCode', s.student_code,
                                                        'fullName', su.full_name)
                                      ORDER BY sp.linked_at, s.student_id)
                      FROM student_parents sp
                      JOIN students s ON s.student_id = sp.student_id
                      JOIN users su ON su.user_id = s.user_id
                      WHERE sp.parent_id = p.parent_id), '[]'::json) AS "childrenSummary"
     FROM ${from}
     ORDER BY ${vietnameseNameOrder('u.full_name')}, p.parent_id
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { items, page, pageSize, total: countRows[0].total };
}

// --- UC-105 ----------------------------------------------------------------------------------------------------

// UC-105 View Parent Detail (School Manager), SCR-10: the parent's profile and their linked children, each with the
// current class (same rule as UC-07 / UC-08 through findCurrentEnrollments). Read only: link / unlink is UC-13
// (FE-02), reset password / lock / unlock are FE-13 – this only returns the account state the screen shows.
// Queries run one after the other (DB_POOL_MAX=3, README §6).
//
// canLinkMore is not returned: the only limit is "at most 2 parents per STUDENT" (business-rules §3), there is no
// limit on the children of a parent, so it would always be true. UC-13 checks the per-student limit when linking.
// The "parent" object of UC-105, also returned by UC-106 so the client uses one shape. Throws 404 when missing.
// db: the pool, or the transaction client of UC-106 so the saved values are read back in the same transaction.
async function findParent(parentId, db = pool) {
  // lockedUntil is the automatic temporary sign-in lock (business-rules §3), returned apart from the manual LOCKED
  // status. As in UC-08, a lock that has already expired is returned as null.
  const { rows: parentRows } = await db.query(
    `SELECT p.parent_id AS "parentId", u.user_id AS "userId", u.full_name AS "fullName", u.username,
            u.avatar_url AS "avatarUrl", u.phone, u.email, p.occupation, u.address, u.status AS "accountStatus",
            u.must_change_password AS "mustChangePassword",
            CASE WHEN u.locked_until > NOW() THEN u.locked_until END AS "lockedUntil", u.created_at AS "createdAt"
     FROM parents p
     JOIN users u ON u.user_id = p.user_id
     WHERE p.parent_id = $1 AND ${HAS_PARENT_ROLE}`,
    [parentId],
  );
  const parent = parentRows[0];
  // Missing, or not a parent account: the same 404, so the response does not tell which.
  if (!parent) throw notFound('MSG_PARENT_NOT_FOUND', 'The parent does not exist.');
  return parent;
}

export async function getParentDetail(parentId) {
  const parent = await findParent(parentId);

  // Children sorted the Vietnamese way (business-rules §16). Locked student accounts stay in the list.
  const { rows: links } = await pool.query(
    `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName",
            u.avatar_url AS "avatarUrl", s.dob, s.gender,
            sp.relationship_type AS "relationshipType", sp.linked_at AS "linkedAt"
     FROM student_parents sp
     JOIN students s ON s.student_id = sp.student_id
     JOIN users u ON u.user_id = s.user_id
     WHERE sp.parent_id = $1
     ORDER BY ${vietnameseNameOrder('u.full_name')}, s.student_id`,
    [parentId],
  );

  const enrollments = await findCurrentEnrollments(links.map((child) => child.studentId));
  const children = links.map((child) => {
    // A child with no class this year yet (business-rules §3): the class fields are null, not an error.
    const e = enrollments.get(child.studentId);
    return {
      ...child,
      classId: e?.classId ?? null,
      className: e?.className ?? null,
      gradeLevelName: e?.gradeLevelName ?? null,
      trackName: e?.trackName ?? null,
      schoolYearName: e?.schoolYearName ?? null,
      enrollmentStatus: e?.status ?? null,
      homeroomTeacherName: e?.homeroomTeacherName ?? null,
    };
  });

  return { parent, children };
}

// --- UC-106 ----------------------------------------------------------------------------------------------------

// Whitelist of the columns UC-106 may write, by table (same pattern as UC-09 updateStudent). The UPDATE is built only
// from these entries, never from the body's keys; the controller has already rejected every other field.
// Login identifiers (email, phone, username), password, status, must_change_password and the sign-in lock fields
// are deliberately absent: only System Admin changes those (business-rules §3, UC-99 / FE-13).
// parents has no updated_at; users.updated_at is set by its set_updated_at trigger.
const EDITABLE_COLUMNS = {
  users: {
    key: 'user_id',
    columns: {
      fullName: { column: 'full_name', type: 'varchar' },
      address: { column: 'address', type: 'varchar' }, // users.address (parents.address was dropped 28/10/2026)
    },
  },
  parents: {
    key: 'parent_id',
    columns: { occupation: { column: 'occupation', type: 'varchar' } },
  },
};

// UPDATE for one table with only the fields present in changes, or null when none of them is. The row is written
// only if a value really differs (IS DISTINCT FROM), so an unchanged save does not fire users' set_updated_at.
function buildUpdate(table, keyValue, changes) {
  const { key, columns } = EDITABLE_COLUMNS[table];
  const params = [keyValue];
  const sets = [];
  const differs = [];
  for (const [field, { column, type }] of Object.entries(columns)) {
    if (!Object.hasOwn(changes, field)) continue;
    params.push(changes[field]);
    sets.push(`${column} = $${params.length}::${type}`);
    differs.push(`${column} IS DISTINCT FROM $${params.length}::${type}`);
  }
  if (!sets.length) return null;
  return {
    sql: `UPDATE ${table} SET ${sets.join(', ')} WHERE ${key} = $1 AND (${differs.join(' OR ')})`,
    params,
  };
}

// UC-106 Update Parent Information (School Manager), SCR-16: full name and address (users), occupation (parents).
// Not the parent's own UC-108 (FE-01). Returns the same "parent" object as UC-105.
// Not logged: profile edits are not in the activity_logs list (business-rules §13).
// ASSUMPTION: a LOCKED parent account can still be edited, as decided for students in UC-09 (27/10/2026).
export async function updateParent(parentId, changes) {
  // users and parents are written together or not at all.
  return withTransaction(async (client) => {
    // FOR UPDATE: two School Managers saving the same parent at once are applied one after the other. Only an
    // account with the PARENT role is found (same 404 as UC-105 otherwise).
    const { rows } = await client.query(
      `SELECT p.user_id FROM parents p JOIN users u ON u.user_id = p.user_id
       WHERE p.parent_id = $1 AND ${HAS_PARENT_ROLE}
       FOR UPDATE OF p, u`,
      [parentId],
    );
    if (!rows[0]) throw notFound('MSG_PARENT_NOT_FOUND', 'The parent does not exist.');

    for (const update of [buildUpdate('users', rows[0].user_id, changes), buildUpdate('parents', parentId, changes)]) {
      if (update) await client.query(update.sql, update.params);
    }
    return findParent(parentId, client);
  });
}
