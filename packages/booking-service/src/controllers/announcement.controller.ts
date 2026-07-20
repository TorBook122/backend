import type { Request, Response } from 'express';
import { listActiveAnnouncements } from '../services/announcement.service.js';

export async function listActive(_req: Request, res: Response) {
  const announcements = await listActiveAnnouncements();
  res.json({ success: true, data: announcements });
}
