import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as ctrl from './admin.controller.js';

// FE-13 System Administration (owner: Linh). System Admin only, except reset password and lock / unlock
// (UC-97, UC-98), which School Manager may use on student, parent and teacher accounts (checked in the service).
const router = Router();
const systemAdmin = [requireAuth, requireRole('SYSTEM_ADMIN')];
const accountControl = [requireAuth, requireRole('SYSTEM_ADMIN', 'SCHOOL_MANAGER')];

// Accounts
router.get('/accounts', ...systemAdmin, ctrl.listAccounts); // UC-94 ?search&role&status&page
router.post('/accounts', ...systemAdmin, ctrl.createAccount); // UC-92
router.get('/accounts/export', ...systemAdmin, ctrl.exportAccounts); // UC-95 ?search&role&status
router.get('/accounts/import/template', ...systemAdmin, ctrl.importTemplate); // UC-93 ?type=STUDENT|TEACHER|PARENT|SCHOOL_MANAGER
router.post('/accounts/import/preview', ...systemAdmin, uploadSingle('file'), ctrl.previewImport); // UC-93 (multipart: type, file)
router.post('/accounts/import', ...systemAdmin, uploadSingle('file'), ctrl.importAccounts); // UC-93
router.get('/accounts/:id', ...systemAdmin, ctrl.getAccount); // SCR-60 Account Detail
router.put('/accounts/:id/identifiers', ...systemAdmin, ctrl.updateIdentifiers); // UC-96
router.get('/accounts/:id/security', ...accountControl, ctrl.getSecurityState); // status for UC-97 / UC-98 buttons
router.post('/accounts/:id/reset-password', ...accountControl, ctrl.resetPassword); // UC-97
router.post('/accounts/:id/lock', ...accountControl, ctrl.lockAccount); // UC-98
router.post('/accounts/:id/unlock', ...accountControl, ctrl.unlockAccount); // UC-98
router.post('/accounts/:id/clear-temporary-lock', ...accountControl, ctrl.clearTemporaryLock); // UC-98 1b
// Password reset requests sent from Forgot Password (FE-01); handled with UC-97 (reset) or rejected.
router.get('/password-reset-requests', ...accountControl, ctrl.listResetRequests); // ?status=PENDING|DONE|REJECTED&page
router.post('/password-reset-requests/:id/reject', ...accountControl, ctrl.rejectResetRequest);

// System settings, maintenance, activity log
router.get('/settings', ...systemAdmin, ctrl.listSettings); // UC-99
router.put('/settings', ...systemAdmin, ctrl.updateSettings); // UC-99 { values: { key: value } }
router.get('/maintenance', ...systemAdmin, ctrl.listMaintenance); // UC-100
router.post('/maintenance', ...systemAdmin, ctrl.createMaintenance); // UC-100
router.put('/maintenance/:id', ...systemAdmin, ctrl.updateMaintenance); // UC-100 3a
router.post('/maintenance/:id/end', ...systemAdmin, ctrl.endMaintenance); // UC-100 3b
router.post('/maintenance/:id/cancel', ...systemAdmin, ctrl.cancelMaintenance); // UC-100 3c

export default router;
