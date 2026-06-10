import { z } from 'zod';
import { UserRole } from '@torbook/shared';

export const registerSchema = z
  .object({
    name: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
    phone: z.string().min(9, 'מספר טלפון לא תקין'),
    email: z.string().email('אימייל לא תקין').optional(),
    password: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
    role: z.nativeEnum(UserRole),
  })
  .superRefine((data, ctx) => {
    if (data.role === UserRole.BUSINESS_OWNER && !data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'אימייל נדרש לבעלי עסק',
        path: ['email'],
      });
    }
  });

export const loginSchema = z.object({
  identifier: z.string().min(3, 'נא להזין אימייל או טלפון'),
  password: z.string().min(1, 'נא להזין סיסמה'),
  rememberMe: z.boolean().optional().default(false),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
