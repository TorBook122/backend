import { z } from 'zod';

export const deleteAccountSchema = z.object({
  password: z.string().min(8, 'סיסמה לא תקינה'),
});

export const gdprDeleteSchema = z.object({
  password: z.string().min(8, 'סיסמה לא תקינה'),
  confirm: z.literal(true, { errorMap: () => ({ message: 'יש לאשר מחיקת נתונים' }) }),
});

export const fcmTokenSchema = z.object({
  token: z.string().min(10, 'טוקן FCM לא תקין'),
});

export type DeleteAccountBody = z.infer<typeof deleteAccountSchema>;
export type GdprDeleteBody = z.infer<typeof gdprDeleteSchema>;
export type FcmTokenBody = z.infer<typeof fcmTokenSchema>;
