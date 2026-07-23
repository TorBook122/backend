import { z } from 'zod';
import { EmployeePermission } from '@torbook/shared';

const selectablePermissions = Object.values(EmployeePermission).filter(
  (p) => p !== EmployeePermission.BROADCAST_MESSAGE,
);

export const createEmployeeRoleSchema = z.object({
  name: z.string().min(2, 'שם התפקיד קצר מדי').max(50, 'שם התפקיד ארוך מדי'),
  permissions: z
    .array(z.nativeEnum(EmployeePermission))
    .min(1, 'יש לבחור לפחות הרשאה אחת')
    .refine(
      (permissions) => permissions.every((p) => p !== EmployeePermission.BROADCAST_MESSAGE),
      { message: 'הרשאה זו אינה זמינה' },
    )
    .refine(
      (permissions) => permissions.every((p) => selectablePermissions.includes(p)),
      { message: 'הרשאה לא תקינה' },
    ),
});

export const updateEmployeeRoleSchema = createEmployeeRoleSchema.partial().refine(
  (data) => data.name !== undefined || data.permissions !== undefined,
  { message: 'יש לעדכן לפחות שדה אחד' },
);

export type CreateEmployeeRoleBody = z.infer<typeof createEmployeeRoleSchema>;
export type UpdateEmployeeRoleBody = z.infer<typeof updateEmployeeRoleSchema>;
