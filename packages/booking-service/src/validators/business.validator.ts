import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const logoUrlSchema = z
  .string()
  .max(300_000)
  .nullable()
  .refine(
    (val) =>
      val === null ||
      val.startsWith('http://') ||
      val.startsWith('https://') ||
      /^data:image\/(jpeg|jpg|png|webp);base64,/.test(val),
    { message: 'כתובת לוגו לא תקינה' },
  );

const socialUrlSchema = z
  .string()
  .max(300)
  .nullable()
  .optional()
  .refine(
    (val) =>
      val == null ||
      val === '' ||
      /^https?:\/\/.+/i.test(val),
    { message: 'קישור לא תקין — יש להזין כתובת שמתחילה ב-http:// או https://' },
  )
  .transform((val) => (val === '' ? null : val));

export const createBusinessSchema = z.object({
  name: z.string().min(2, 'שם העסק קצר מדי').max(100),
  category: z.string().max(50).optional(),
  address: z.string().min(1, 'כתובת חובה').max(200),
  phone: z.string().min(9, 'מספר טלפון לא תקין'),
  instagramUrl: socialUrlSchema,
  whatsappUrl: socialUrlSchema,
  facebookUrl: socialUrlSchema,
  tiktokUrl: socialUrlSchema,
});

export const updateBusinessSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  category: z.string().max(50).optional(),
  notes: z.string().max(500).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  instagramUrl: socialUrlSchema,
  whatsappUrl: socialUrlSchema,
  facebookUrl: socialUrlSchema,
  tiktokUrl: socialUrlSchema,
  logoUrl: logoUrlSchema.optional(),
  phone: z.string().min(9).optional(),
  cancellationWindowHours: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(4),
    z.literal(12),
    z.literal(24),
    z.literal(48),
  ]).optional(),
});

export const availabilityDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isActive: z.boolean(),
  startTime: z.string().regex(timeRegex),
  endTime: z.string().regex(timeRegex),
});

export const updateAvailabilitySchema = z.object({
  days: z.array(availabilityDaySchema).length(7),
});

export const breakBlockSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(timeRegex),
  endTime: z.string().regex(timeRegex),
});

export const updateBreaksSchema = z.object({
  breaks: z.array(breakBlockSchema),
});

export const createServiceSchema = z.object({
  name: z.string().min(1, 'שם השירות חובה').max(100),
  durationMins: z.number().int().min(15).max(480),
  price: z.number().int().min(0).default(0),
});

export const updateServiceSchema = createServiceSchema.partial();

export const timeBlockSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  note: z.string().max(200).optional(),
}).refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
  message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
});

export type CreateBusinessBody = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessBody = z.infer<typeof updateBusinessSchema>;
export type UpdateAvailabilityBody = z.infer<typeof updateAvailabilitySchema>;
export type UpdateBreaksBody = z.infer<typeof updateBreaksSchema>;
export type CreateServiceBody = z.infer<typeof createServiceSchema>;
export type UpdateServiceBody = z.infer<typeof updateServiceSchema>;
export type TimeBlockBody = z.infer<typeof timeBlockSchema>;
