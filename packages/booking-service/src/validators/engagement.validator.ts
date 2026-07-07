import { z } from 'zod';

export const businessSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9\u0590-\u05FF-]+$/);

export const createCommentSchema = z.object({
  appointmentId: z.string().min(1, 'יש לבחור תור'),
  text: z.string().trim().min(1, 'תגובה ריקה').max(500, 'תגובה ארוכה מדי'),
});

export const updateCommentSchema = z.object({
  text: z.string().trim().min(1, 'תגובה ריקה').max(500, 'תגובה ארוכה מדי'),
});

export type CreateCommentBody = z.infer<typeof createCommentSchema>;
export type UpdateCommentBody = z.infer<typeof updateCommentSchema>;
