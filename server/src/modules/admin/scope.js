import { forbidden } from '../../utils/AppError.js';

// FE-13 (owner: Linh): what a School Manager may do on accounts (permissions note 1, widened 23/11/2026).
// School Manager creates, imports, exports, edits the email and phone of, resets and locks student, teacher and
// parent accounts only; School Manager and System Admin accounts stay with System Admin. Routes already let only
// these two roles in; `actor` = { userId, activeRole }.

export const SCHOOL_ROLES = ['TEACHER', 'STUDENT', 'PARENT'];

export const isSchoolManager = (actor) => actor?.activeRole === 'SCHOOL_MANAGER';

// True when every role is one a School Manager may handle (and there is at least one).
export const onlySchoolRoles = (roles = []) => roles.length > 0 && roles.every((r) => SCHOOL_ROLES.includes(r));

// 403 for a School Manager acting on a role list outside student / teacher / parent; System Admin passes.
export function assertSchoolScope(actor, roles) {
  if (isSchoolManager(actor) && !onlySchoolRoles(roles)) throw forbidden();
}
