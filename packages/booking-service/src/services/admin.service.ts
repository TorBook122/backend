import { prisma } from '@torbook/db';

export type AdminBusinessRow = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  createdAt: string;
  deletedAt: string | null;
};

export async function listAdminBusinesses(): Promise<AdminBusinessRow[]> {
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

  return businesses.map((business) => ({
    id: business.id,
    name: business.name,
    slug: business.slug,
    category: business.category,
    createdAt: business.createdAt.toISOString(),
    deletedAt: business.deletedAt?.toISOString() ?? null,
  }));
}
