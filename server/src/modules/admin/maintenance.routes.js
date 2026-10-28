import { Router } from 'express';
import * as ctrl from './admin.controller.js';

// FE-13 UC-100: the maintenance banner. Public on purpose – it is also shown before sign-in.
const router = Router();
router.get('/current', ctrl.currentMaintenance);

export default router;
