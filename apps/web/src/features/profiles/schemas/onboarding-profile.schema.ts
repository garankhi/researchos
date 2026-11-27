import { z } from 'zod';
import { availabilityStatusValues } from './profile-form.schema';

/**
 * The ORCID pattern.
 *
 * The bare 16-digit form with the dashes: `0000-0000-0000-0000`. The
 * check digit may be an `X`, which is the one case the format allows.
 *
 * The pattern is checked here as well as on the server, so the
 * researcher learns the format before the request is made — but the
 * server check is the one that counts, and this one exists to keep the
 * message next to the input.
 */
const ORCID_PATTERN = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/**
 * The profile information the onboarding's profile step collects.
 *
 * Every field is optional — the step itself is optional, and a
 * researcher who has nothing to add may skip it. The `fullName` and
 * `departmentUnit` are pre-filled from the account, so they are only
 * required when the researcher actually changes them.
 */
export const onboardingProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'full_name_required')
    .max(255, 'full_name_too_long')
    .optional(),
  departmentUnit: z
    .string()
    .trim()
    .min(1, 'department_unit_required')
    .max(255, 'department_unit_too_long')
    .optional(),
  academicTitle: z
    .string()
    .trim()
    .max(100, 'academic_title_too_long')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  academicDegree: z
    .string()
    .trim()
    .max(100, 'academic_degree_too_long')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  orcidId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((val) => !val || ORCID_PATTERN.test(val), {
      message: 'orcid_id_invalid',
    })
    .transform((val) => (val && val.length > 0 ? val : null)),
  bio: z
    .string()
    .trim()
    .max(2000, 'bio_too_long')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  availabilityStatus: z.enum(availabilityStatusValues).optional(),
  googleScholarUrl: z
    .string()
    .trim()
    .max(500, 'google_scholar_url_too_long')
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
      { message: 'google_scholar_url_invalid' },
    )
    .transform((val) => (val && val.length > 0 ? val : null)),
  scopusAuthorId: z
    .string()
    .trim()
    .max(50, 'scopus_author_id_too_long')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
});

export type OnboardingProfileValues = z.input<typeof onboardingProfileSchema>;
export type OnboardingProfileOutput = z.output<typeof onboardingProfileSchema>;
