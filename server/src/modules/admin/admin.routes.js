import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as ctrl from './admin.controller.js';

// FE-13 System Administration (owner: Linh). System Admin only, except the account routes marked accountControl:
// School Manager may use them on student, teacher and parent accounts (checked in the services, scope.js): create
// (UC-95), import (UC-96), export (UC-98), detail and email / phone edit (UC-99) since 23/11/2026, reset and lock
// (UC-100, UC-101) since 01/11/2026.
const router = Router();
const systemAdmin = [requireAuth, requireRole('SYSTEM_ADMIN')];
const accountControl = [requireAuth, requireRole('SYSTEM_ADMIN', 'SCHOOL_MANAGER')];

// Accounts
router.get('/accounts', ...systemAdmin, ctrl.listAccounts); // UC-97 ?search&role&status&classId&page
router.post('/accounts', ...accountControl, ctrl.createAccount); // UC-95
router.get('/accounts/export', ...accountControl, ctrl.exportAccounts); // UC-98 ?search&role&status&classId
router.get('/accounts/classes', ...systemAdmin, ctrl.listClassOptions); // UC-97 class filter options
router.get('/accounts/department-options', ...accountControl, ctrl.departmentOptions); // UC-95 department picker (FE-03 list)
router.get('/accounts/import/template', ...accountControl, ctrl.importTemplate); // UC-96 ?type=STUDENT|TEACHER|PARENT|SCHOOL_MANAGER
router.post('/accounts/import/preview', ...accountControl, uploadSingle('file'), ctrl.previewImport); // UC-96 (multipart: type, file)
router.post('/accounts/import', ...accountControl, uploadSingle('file'), ctrl.importAccounts); // UC-96
router.get('/accounts/:id', ...accountControl, ctrl.getAccount); // SCR-60 Account Detail
router.put('/accounts/:id', ...accountControl, ctrl.updateAccount); // UC-99 username + the fields of the import file
router.get('/accounts/:id/security', ...accountControl, ctrl.getSecurityState); // status for UC-100 / UC-101 buttons
router.post('/accounts/:id/reset-password', ...accountControl, ctrl.resetPassword); // UC-100
router.post('/accounts/:id/lock', ...accountControl, ctrl.lockAccount); // UC-101
router.post('/accounts/:id/unlock', ...accountControl, ctrl.unlockAccount); // UC-101
router.post('/accounts/:id/clear-temporary-lock', ...accountControl, ctrl.clearTemporaryLock); // UC-101 1b
// Password reset requests sent from Forgot Password (FE-01): the system issues a one-time password, SA / SM read it.
router.get('/password-reset-requests', ...accountControl, ctrl.listResetRequests); // ?status=PENDING|DONE&page

// System settings, maintenance
router.get('/settings', ...systemAdmin, ctrl.listSettings); // UC-102
router.put('/settings', ...systemAdmin, ctrl.updateSettings); // UC-102 { values: { key: value } }
router.get('/maintenance', ...systemAdmin, ctrl.listMaintenance); // UC-103
router.post('/maintenance', ...systemAdmin, ctrl.createMaintenance); // UC-103
router.put('/maintenance/:id', ...systemAdmin, ctrl.updateMaintenance); // UC-103 3a
router.post('/maintenance/:id/end', ...systemAdmin, ctrl.endMaintenance); // UC-103 3b
router.post('/maintenance/:id/cancel', ...systemAdmin, ctrl.cancelMaintenance); // UC-103 3c

export default router;
