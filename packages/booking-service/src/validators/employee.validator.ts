import { z } from 'zod';

const optionalTitle = z
  .union([z.string().max(80), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v == null || v === '' ? null : v));

export const createEmployeeSchema = z.object({
  name: z.string().min(2, 'שם העובד קצר מדי').max(100),
  phone: z.string().min(9, 'מספר טלפון לא תקין').max(20),
  email: z.string().email('כתובת אימייל לא תקינה').max(200),
  title: optionalTitle,
  roleId: z.string().min(1, 'יש לבחור תפקיד'),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export type CreateEmployeeBody = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeSchema>;
