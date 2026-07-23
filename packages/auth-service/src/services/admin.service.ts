import { prisma } from '@torbook/db';
import { tryDecryptPii } from '@torbook/shared';

export type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  createdAt: string;
  deletedAt: string | null;
};

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      emailEnc: true,
      role: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: tryDecryptPii(user.emailEnc),
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
  }));
}
