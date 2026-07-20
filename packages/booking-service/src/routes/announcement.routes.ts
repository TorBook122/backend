import { Router } from 'express';
import * as announcementController from '../controllers/announcement.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get('/active', requireAuth, asyncHandler(announcementController.listActive));

export default router;
