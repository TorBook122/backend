import { z } from 'zod';

export const createAppointmentSchema = z
  .object({
    serviceId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה'),
  })
  .refine(
    (v) => {
      const startsAt = new Date(`${v.date}T${v.time}:00`);
      return startsAt > new Date();
    },
    { message: 'לא ניתן להזמין תור בעבר' },
  );

export type CreateAppointmentBody = z.infer<typeof createAppointmentSchema>;
