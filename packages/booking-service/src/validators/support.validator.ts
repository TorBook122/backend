import { z } from 'zod';

export const createSupportRequestSchema = z.object({
  fullName: z.string().trim().min(1, 'נא למלא שם מלא').max(120, 'שם ארוך מדי'),
  email: z.string().trim().email('כתובת אימייל לא תקינה').max(254, 'אימייל ארוך מדי'),
  message: z.string().trim().min(1, 'נא לכתוב הודעה').max(5000, 'ההודעה ארוכה מדי'),
});

export type CreateSupportRequestBody = z.infer<typeof createSupportRequestSchema>;
