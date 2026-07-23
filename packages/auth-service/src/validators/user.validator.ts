import { z } from 'zod';

const imageUrlRefine = (val: string | null) =>
  val === null ||
  val.startsWith('http://') ||
  val.startsWith('https://') ||
  /^data:image\/(jpeg|jpg|png|webp);base64,/.test(val);

const avatarUrlSchema = z
  .string()
  .max(300_000)
  .nullable()
  .refine(imageUrlRefine, { message: 'כתובת תמונת פרופיל לא תקינה' });

export const updateProfileSchema = z
  .object({
    name: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים').optional(),
    email: z.preprocess(
      (val) => (val === '' || val === null ? undefined : val),
      z.string().email('אימייל לא תקין').optional(),
    ),
    phone: z.string().min(9, 'מספר טלפון לא תקין').optional(),
    avatarUrl: avatarUrlSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.phone !== undefined ||
      data.avatarUrl !== undefined,
    { message: 'יש לספק לפחות שדה אחד לעדכון' },
  );

export const changePasswordSchema = z
  .object({
    password: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
    confirmPassword: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'הסיסמאות אינן תואמות',
    path: ['confirmPassword'],
  });

export const deleteAccountSchema = z.object({
  password: z.string().min(8, 'סיסמה לא תקינה'),
});

export const gdprDeleteSchema = z.object({
  password: z.string().min(8, 'סיסמה לא תקינה'),
  confirm: z.literal(true, { errorMap: () => ({ message: 'יש לאשר מחיקת נתונים' }) }),
});

export const completePhoneSchema = z.object({
  phone: z.string().min(9, 'מספר טלפון לא תקין'),
});

export const fcmTokenSchema = z.object({
  token: z.string().min(10, 'טוקן FCM לא תקין'),
});

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
export type DeleteAccountBody = z.infer<typeof deleteAccountSchema>;
export type GdprDeleteBody = z.infer<typeof gdprDeleteSchema>;
export type CompletePhoneBody = z.infer<typeof completePhoneSchema>;
export type FcmTokenBody = z.infer<typeof fcmTokenSchema>;
