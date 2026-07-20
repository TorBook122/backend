import { Router } from 'express';
import { API_ERROR_CODES } from '@torbook/shared';
import { listAdminBusinesses } from '../services/admin.service.js';
import {
  createAnnouncement,
  listAllAnnouncements,
  setAnnouncementActive,
} from '../services/announcement.service.js';
import { AppError } from '../utils/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

function requireInternalSecret(req: import('express').Request) {
  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  if (!expected || secret !== expected) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'Unauthorized');
  }
}

router.get(
  '/admin/businesses',
  asyncHandler(async (req, res) => {
    requireInternalSecret(req);
    const businesses = await listAdminBusinesses();
    res.json({ success: true, data: businesses });
  }),
);

router.get(
  '/admin/announcements',
  asyncHandler(async (req, res) => {
    requireInternalSecret(req);
    const announcements = await listAllAnnouncements();
    res.json({ success: true, data: announcements });
  }),
);

router.post(
  '/admin/announcements',
  asyncHandler(async (req, res) => {
    requireInternalSecret(req);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const publishedBy =
      typeof req.body?.publishedBy === 'string' && req.body.publishedBy.trim()
        ? req.body.publishedBy.trim()
        : 'admin';

    if (!title || !body) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'title and body are required');
    }

    const announcement = await createAnnouncement({ title, body, publishedBy });
    res.status(201).json({ success: true, data: announcement });
  }),
);

router.patch(
  '/admin/announcements/:id',
  asyncHandler(async (req, res) => {
    requireInternalSecret(req);
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    const isActive = req.body?.isActive === true || req.body?.isActive === 'true';

    const announcement = await setAnnouncementActive(id, isActive);
    if (!announcement) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Announcement not found');
    }

    res.json({ success: true, data: announcement });
  }),
);

export default router;
