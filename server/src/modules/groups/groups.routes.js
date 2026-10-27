import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './groups.controller.js';

// FE-04 Class & Group Management – groups and teams (owner: Khanh). Screens SCR-22 Group List, SCR-23 Group Detail,
// SCR-24 Group Member List (UC-32..34 writes: School Manager or homeroom teacher, checked in the service).
// The System Admin is in no group (business-rules §2); the data scope of the other roles
// is checked in groupAccess.js.
const router = Router();

router.use(requireAuth, requireRole('SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'));

router.get('/', ctrl.list); // UC-29 View Group List
router.get('/teams/options', ctrl.teamOptions); // UC-35 (before /:id)
router.post('/teams', ctrl.createTeam); // UC-35 Create Team Chat
router.get('/:id', ctrl.detail); // UC-30 View Group Detail
router.get('/:id/members', ctrl.members); // UC-31 View Group Members
router.get('/:id/candidates', ctrl.candidates); // UC-32
router.post('/:id/members', ctrl.addMembers); // UC-32 Add Group Member
router.delete('/:id/members/:userId', ctrl.removeMember); // UC-33 Remove Group Member
router.put('/:id/members/:userId/nickname', ctrl.setNickname); // UC-34 Set Student Nickname
router.post('/:id/leave', ctrl.leave); // leave a team (teams only, see teams.service.js)

export default router;
