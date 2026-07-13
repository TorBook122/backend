import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../client.js';

const router = Router();

type RankedRow = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  like_count: number;
  comment_count: number;
  score: number;
};

router.get('/rankings', async (req, res) => {
  const categoriesParam = typeof req.query.categories === 'string' ? req.query.categories : '';
  const categories = categoriesParam
    .split(',')
    .map((category) => category.trim())
    .filter(Boolean);

  if (categories.length === 0) {
    res.status(400).json({ success: false, error: 'categories query param is required' });
    return;
  }

  const data = await Promise.all(
    categories.map(async (category) => {
      const businesses = await prisma.$queryRaw<RankedRow[]>(Prisma.sql`
        SELECT
          b.id,
          b.name,
          b.slug,
          b.category,
          COALESCE(l.like_count, 0)::int AS like_count,
          COALESCE(c.comment_count, 0)::int AS comment_count,
          (COALESCE(l.like_count, 0) + COALESCE(c.comment_count, 0))::int AS score
        FROM "Business" b
        INNER JOIN "User" u ON b."ownerId" = u.id
        LEFT JOIN (
          SELECT "businessId", COUNT(*)::int AS like_count
          FROM "BusinessLike"
          GROUP BY "businessId"
        ) l ON l."businessId" = b.id
        LEFT JOIN (
          SELECT "businessId", COUNT(*)::int AS comment_count
          FROM "BusinessComment"
          GROUP BY "businessId"
        ) c ON c."businessId" = b.id
        WHERE b."deletedAt" IS NULL
          AND u."onboardingCompletedAt" IS NOT NULL
          AND b.category = ${category}
        ORDER BY score DESC, b.name ASC
        LIMIT 10
      `);

      return {
        category,
        businesses: businesses.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          category: row.category,
          likeCount: row.like_count,
          commentCount: row.comment_count,
          score: row.score,
        })),
      };
    }),
  );

  res.json({ success: true, data });
});

router.get('/map', async (_req, res) => {
  const businesses = await prisma.business.findMany({
    where: {
      deletedAt: null,
      owner: { onboardingCompletedAt: { not: null } },
      address: { not: null },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      address: true,
      logoUrl: true,
      latitude: true,
      longitude: true,
    },
    orderBy: { name: 'asc' },
  });

  res.json({
    success: true,
    data: businesses.map((business) => ({
      id: business.id,
      name: business.name,
      slug: business.slug,
      category: business.category,
      address: business.address as string,
      logoUrl: business.logoUrl,
      latitude: business.latitude as number,
      longitude: business.longitude as number,
    })),
  });
});

router.get('/geocode-pending', async (_req, res) => {
  const businesses = await prisma.business.findMany({
    where: {
      deletedAt: null,
      owner: { onboardingCompletedAt: { not: null } },
      address: { not: null },
      OR: [{ latitude: null }, { longitude: null }],
    },
    select: { id: true, address: true },
    orderBy: { updatedAt: 'asc' },
    take: 10,
  });

  res.json({
    success: true,
    data: businesses.map((business) => ({
      id: business.id,
      address: business.address as string,
    })),
  });
});

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

router.get('/slug/:slug', async (req, res) => {
  const include = req.query.include as string | undefined;
  const business = await prisma.business.findFirst({
    where: { slug: req.params.slug, deletedAt: null },
    include: include === 'full'
      ? {
          availability: true,
          breakBlocks: true,
          services: { where: { isVisible: true }, orderBy: { name: 'asc' } },
        }
      : undefined,
  });
  if (!business) {
    res.status(404).json({ success: false, error: 'Business not found' });
    return;
  }
  res.json({ success: true, data: business });
});

router.get('/slug/:slug/exists', async (req, res) => {
  const business = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  res.json({ success: true, data: { exists: !!business } });
});

router.get('/owner/:ownerId', async (req, res) => {
  const business = await prisma.business.findFirst({
    where: { ownerId: req.params.ownerId, deletedAt: null },
    include: {
      availability: true,
      breakBlocks: true,
      services: { orderBy: { name: 'asc' } },
    },
  });
  res.json({ success: true, data: business });
});

router.get('/:id', async (req, res) => {
  const include = req.query.include as string | undefined;
  const business = await prisma.business.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: include === 'full'
      ? {
          availability: true,
          breakBlocks: true,
          services: { where: { isVisible: true } },
        }
      : undefined,
  });
  if (!business) {
    res.status(404).json({ success: false, error: 'Business not found' });
    return;
  }
  res.json({ success: true, data: business });
});

router.get('/', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
  const admin = req.query.admin === 'true';

  if (admin) {
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    res.json({ success: true, data: businesses });
    return;
  }

  const businesses = await prisma.business.findMany({
    where: {
      deletedAt: null,
      owner: { onboardingCompletedAt: { not: null } },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { category: { contains: query, mode: 'insensitive' } },
              { slug: { contains: query, mode: 'insensitive' } },
              { address: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, slug: true, category: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: businesses });
});

router.post('/', async (req, res) => {
  const business = await prisma.business.create({
    data: req.body,
    include: { availability: true, breakBlocks: true, services: true },
  });
  res.status(201).json({ success: true, data: business });
});

router.patch('/:id', async (req, res) => {
  const business = await prisma.business.update({
    where: { id: req.params.id },
    data: req.body,
    include: {
      availability: true,
      breakBlocks: true,
      services: { where: { isVisible: true } },
    },
  });
  res.json({ success: true, data: business });
});

router.get('/:id/future-appointments-count', async (req, res) => {
  const count = await prisma.appointment.count({
    where: {
      businessId: req.params.id,
      status: 'CONFIRMED',
      startsAt: { gt: new Date() },
    },
  });
  res.json({ success: true, data: { count } });
});

router.put('/:id/availability', async (req, res) => {
  const businessId = req.params.id;
  const { days } = req.body as {
    days: Array<{ dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }>;
  };

  if (!Array.isArray(days)) {
    res.status(400).json({ success: false, error: 'days array is required' });
    return;
  }

  for (const day of days) {
    if (day.isActive && parseTime(day.endTime) <= parseTime(day.startTime)) {
      res.status(400).json({
        success: false,
        error: 'End time must be after start time',
        code: 'VALIDATION_ERROR',
      });
      return;
    }
  }

  await prisma.$transaction(
    days.map((day) =>
      prisma.availability.upsert({
        where: { businessId_dayOfWeek: { businessId, dayOfWeek: day.dayOfWeek } },
        create: {
          businessId,
          dayOfWeek: day.dayOfWeek,
          isActive: day.isActive,
          startTime: day.startTime,
          endTime: day.endTime,
        },
        update: {
          isActive: day.isActive,
          startTime: day.startTime,
          endTime: day.endTime,
        },
      }),
    ),
  );

  const rows = await prisma.availability.findMany({
    where: { businessId },
    orderBy: { dayOfWeek: 'asc' },
  });
  res.json({ success: true, data: rows });
});

router.put('/:id/breaks', async (req, res) => {
  const businessId = req.params.id;
  const { breaks } = req.body as {
    breaks: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  };

  if (!Array.isArray(breaks)) {
    res.status(400).json({ success: false, error: 'breaks array is required' });
    return;
  }

  const availability = await prisma.availability.findMany({ where: { businessId } });

  for (const brk of breaks) {
    const day = availability.find((a) => a.dayOfWeek === brk.dayOfWeek);
    if (!day?.isActive) {
      res.status(400).json({
        success: false,
        error: 'Break only on active day',
        code: 'VALIDATION_ERROR',
      });
      return;
    }
    const brkStart = parseTime(brk.startTime);
    const brkEnd = parseTime(brk.endTime);
    const dayStart = parseTime(day.startTime);
    const dayEnd = parseTime(day.endTime);
    if (brkEnd <= brkStart || brkStart < dayStart || brkEnd > dayEnd) {
      res.status(400).json({
        success: false,
        error: 'Break must be within business hours',
        code: 'VALIDATION_ERROR',
      });
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.breakBlock.deleteMany({ where: { businessId } });
    if (breaks.length > 0) {
      await tx.breakBlock.createMany({
        data: breaks.map((b) => ({
          businessId,
          dayOfWeek: b.dayOfWeek,
          startTime: b.startTime,
          endTime: b.endTime,
        })),
      });
    }
  });

  const rows = await prisma.breakBlock.findMany({
    where: { businessId },
    orderBy: { dayOfWeek: 'asc' },
  });
  res.json({ success: true, data: rows });
});

export default router;
