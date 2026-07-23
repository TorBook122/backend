import { prisma } from '@torbook/db';
import { tryDecryptPii } from '@torbook/shared';

export type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  hasPhone: boolean;
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
      phoneEnc: true,
      phoneHash: true,
      role: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  let decryptFailed = 0;
  const rows = users.map((user) => {
    const email = tryDecryptPii(user.emailEnc);
    const phone = tryDecryptPii(user.phoneEnc);
    if (user.phoneEnc && !phone) {
      decryptFailed += 1;
    }
    return {
      id: user.id,
      name: user.name,
      email,
      phone,
      hasPhone: !!user.phoneHash,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      deletedAt: user.deletedAt?.toISOString() ?? null,
    };
  });

  // eslint-disable-next-line no-console
  console.log('[admin] listAdminUsers', {
    total: rows.length,
    withPhoneHash: rows.filter((u) => u.hasPhone).length,
    withPhone: rows.filter((u) => !!u.phone).length,
    phoneDecryptFailed: decryptFailed,
  });

  return rows;
}
