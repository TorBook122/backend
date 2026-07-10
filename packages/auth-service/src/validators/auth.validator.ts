import { z } from 'zod';
import { UserRole } from '@torbook/shared';

export const registerSchema = z.object({
  name: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  phone: z.string().min(9, 'מספר טלפון לא תקין'),
  email: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string({ required_error: 'נא להזין אימייל' }).email('אימייל לא תקין'),
  ),
  password: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
  role: z.nativeEnum(UserRole),
});

export const loginSchema = z.object({
  identifier: z.string().min(3, 'נא להזין אימייל או טלפון'),
  password: z.string().min(1, 'נא להזין סיסמה'),
  rememberMe: z.boolean().optional().default(false),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(10),
  role: z.nativeEnum(UserRole).optional(),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type GoogleAuthBody = z.infer<typeof googleAuthSchema>;
