import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './schoolposts.controller.js';

// FE-08 School Feed (owner: Anh), 17/11/2026: the School Manager's queue of reported comments (SCR proposed: "Báo cáo
// bình luận"). School Manager only, under the active role; every other role, System Admin included → 403. Only
// comments of SCHOOL posts are listed or handled here (business-rules §1: the School Manager does not see class feeds);
// FE-05 handles group comment reports on its own routes with the same utils/commentReports.js.
const router = Router();
const manage = [requireAuth, requireRole('SCHOOL_MANAGER')];

router.get('/', ...manage, ctrl.listCommentReports);
router.patch('/:commentId', ...manage, ctrl.resolveCommentReport);

export default router;
