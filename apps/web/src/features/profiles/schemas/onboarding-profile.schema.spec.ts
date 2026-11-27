import { describe, expect, it } from 'vitest';
import { onboardingProfileSchema } from './onboarding-profile.schema';

describe('onboardingProfileSchema', () => {
  it('accepts an empty payload — the step is optional', () => {
    const parsed = onboardingProfileSchema.parse({});

    expect(parsed.fullName).toBeUndefined();
    expect(parsed.orcidId).toBeNull();
  });

  it('trims the fields and turns the empty ones into null', () => {
    const parsed = onboardingProfileSchema.parse({
      fullName: '  Jane Doe  ',
      departmentUnit: '  Computer Science  ',
      academicTitle: '   ',
      orcidId: ' 0000-0002-1825-0097 ',
      bio: '   ',
    });

    expect(parsed.fullName).toBe('Jane Doe');
    expect(parsed.departmentUnit).toBe('Computer Science');
    expect(parsed.academicTitle).toBeNull();
    expect(parsed.orcidId).toBe('0000-0002-1825-0097');
    expect(parsed.bio).toBeNull();
  });

  it('accepts an ORCID with an X check digit', () => {
    const parsed = onboardingProfileSchema.parse({
      orcidId: '0000-0003-1415-926X',
    });

    expect(parsed.orcidId).toBe('0000-0003-1415-926X');
  });

  it('rejects an ORCID that is not in the bare form', () => {
    const result = onboardingProfileSchema.safeParse({
      orcidId: 'https://orcid.org/0000-0002-1825-0097',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a name that is only whitespace', () => {
    const result = onboardingProfileSchema.safeParse({
      fullName: '   ',
      departmentUnit: 'Computer Science',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a Google Scholar link that is not a URL', () => {
    const result = onboardingProfileSchema.safeParse({
      googleScholarUrl: 'not a url',
    });

    expect(result.success).toBe(false);
  });
});
