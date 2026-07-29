import { prisma } from '@torbook/db';
import type { SupportRequestDto } from '@torbook/shared';

function toSupportRequestDto(row: {
  id: string;
  fullName: string;
  email: string;
  message: string;
  userId: string | null;
  createdAt: Date;
}): SupportRequestDto {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    message: row.message,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createSupportRequest(input: {
  fullName: string;
  email: string;
  message: string;
  userId?: string;
}): Promise<SupportRequestDto> {
  const row = await prisma.supportRequest.create({
    data: {
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      message: input.message.trim(),
      userId: input.userId ?? null,
    },
  });
  return toSupportRequestDto(row);
}

export async function listSupportRequests(): Promise<SupportRequestDto[]> {
  const rows = await prisma.supportRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(toSupportRequestDto);
}
