import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import * as ctrl from './moderation.controller.js';

// Moderation (FE-08, owner Anh, 25/11/2026, docs/moderation-plan.md): reports of chat messages. Mounted at
// /api/v1/moderation. Permissions use the ACTIVE role; the service checks them again (the School Manager's reads are
// the only door to chat content for a non-member).
const router = Router();
const manager = [requireAuth, requireRole('SCHOOL_MANAGER')];

// Any chat member (the service checks the membership with FE-06's openChat); the System Admin has no chats.
router.post('/message-reports', requireAuth, requireRole('SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'), ctrl.reportMessage);

// School Manager: the queue, the reported message alone (OPEN report, not logged), the 6 + 6 messages around it with a
// reason (logged), the decision. No way to read the whole chat (removed 27/11/2026).
router.get('/message-reports/summary', ...manager, ctrl.messageReportSummary); // phase 6: menu badge
router.get('/message-reports', ...manager, ctrl.listMessageReports);
router.get('/message-reports/:messageId', ...manager, ctrl.reportedMessage);
router.post('/message-reports/:messageId/context', ...manager, ctrl.context);
router.patch('/message-reports/:messageId', ...manager, ctrl.resolveMessageReport);

// Phase 6 – "Quy chuẩn cộng đồng" (School Manager only). Statistics never carry content; content only through
// /violations/:id/content (one piece, logged) and the message-report reads above.
router.get('/violations', ...manager, ctrl.listViolators);
router.get('/violations/export', ...manager, ctrl.exportViolators);
router.get('/violations/by-class', ...manager, ctrl.listByClass);
router.get('/violations/users/:userId', ...manager, ctrl.userHistory);
router.get('/violations/:id/content', ...manager, ctrl.violationContent);
router.post('/violations/:id/unhide', ...manager, ctrl.unhide);
router.get('/rules', ...manager, ctrl.listRules);
router.post('/rules/test', ...manager, ctrl.testRules);
router.post('/rules', ...manager, ctrl.createRule);
router.patch('/rules/:id', ...manager, ctrl.updateRule);
router.delete('/rules/:id', ...manager, ctrl.deleteRule);

export default router;
