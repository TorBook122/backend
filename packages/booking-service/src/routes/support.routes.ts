import { Router } from 'express';
import * as supportController from '../controllers/support.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post('/', optionalAuth, asyncHandler(supportController.submit));

export default router;
