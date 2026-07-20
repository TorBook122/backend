import { prisma } from '@torbook/db';
import type { AnnouncementDto } from '@torbook/shared';

function toAnnouncementDto(row: {
  id: string;
  title: string;
  body: string;
  isActive: boolean;
  publishedBy: string;
  createdAt: Date;
}): AnnouncementDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    isActive: row.isActive,
    publishedBy: row.publishedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listActiveAnnouncements(): Promise<AnnouncementDto[]> {
  const rows = await prisma.announcement.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map(toAnnouncementDto);
}

export async function listAllAnnouncements(): Promise<AnnouncementDto[]> {
  const rows = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(toAnnouncementDto);
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  publishedBy: string;
}): Promise<AnnouncementDto> {
  const row = await prisma.announcement.create({
    data: {
      title: input.title.trim(),
      body: input.body.trim(),
      publishedBy: input.publishedBy.trim(),
      isActive: true,
    },
  });
  return toAnnouncementDto(row);
}

export async function setAnnouncementActive(
  id: string,
  isActive: boolean,
): Promise<AnnouncementDto | null> {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return null;

  const row = await prisma.announcement.update({
    where: { id },
    data: { isActive },
  });
  return toAnnouncementDto(row);
}
