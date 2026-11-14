import { z } from 'zod';

export const availabilityStatusValues = [
  'OPEN_FOR_COLLABORATION',
  'SEEKING_GROUP',
  'MENTORING_ONLY',
  'LIMITED_AVAILABILITY',
  'NOT_AVAILABLE',
] as const;

export const profileFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'required')
    .max(255, 'max_length_exceeded'),
  departmentUnit: z
    .string()
    .trim()
    .min(1, 'required')
    .max(255, 'max_length_exceeded'),
  academicTitle: z
    .string()
    .trim()
    .max(100, 'max_length_exceeded')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  academicDegree: z
    .string()
    .trim()
    .max(100, 'max_length_exceeded')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  bio: z
    .string()
    .trim()
    .max(2000, 'max_length_exceeded')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  availabilityStatus: z.enum(availabilityStatusValues),
  googleScholarUrl: z
    .string()
    .trim()
    .max(2048, 'max_length_exceeded')
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val || val.length === 0) return true;
        try {
          const url = new URL(val);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'invalid_url' },
    )
    .transform((val) => (val && val.length > 0 ? val : null)),
  scopusAuthorId: z
    .string()
    .trim()
    .max(255, 'max_length_exceeded')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export type ProfileFormValues = z.input<typeof profileFormSchema>;
export type ProfileFormOutput = z.output<typeof profileFormSchema>;
