import { describe, expect, it } from 'vitest';
import { profileFormSchema } from './profile-form.schema';

describe('profileFormSchema', () => {
  it('validates a complete valid profile', () => {
    const input = {
      fullName: 'Dr. Jane Doe',
      departmentUnit: 'Computer Science',
      academicTitle: 'Associate Professor',
      academicDegree: 'Ph.D.',
      bio: 'Researching machine learning and privacy.',
      availabilityStatus: 'OPEN_FOR_COLLABORATION',
      googleScholarUrl: 'https://scholar.google.com/citations?user=123',
      scopusAuthorId: '57190000000',
    };

    const parsed = profileFormSchema.parse(input);
    expect(parsed).toEqual(input);
  });

  it('transforms empty strings into null for optional fields', () => {
    const input = {
      fullName: '  Jane Doe  ',
      departmentUnit: '  CS Dept  ',
      academicTitle: '   ',
      academicDegree: '',
      bio: '   ',
      availabilityStatus: 'NOT_AVAILABLE',
      googleScholarUrl: '',
      scopusAuthorId: '   ',
    };

    const parsed = profileFormSchema.parse(input);
    expect(parsed).toEqual({
      fullName: 'Jane Doe',
      departmentUnit: 'CS Dept',
      academicTitle: null,
      academicDegree: null,
      bio: null,
      availabilityStatus: 'NOT_AVAILABLE',
      googleScholarUrl: null,
      scopusAuthorId: null,
    });
  });

  it('rejects invalid google scholar URL', () => {
    const input = {
      fullName: 'Jane Doe',
      departmentUnit: 'CS',
      availabilityStatus: 'OPEN_FOR_COLLABORATION',
      googleScholarUrl: 'not-a-valid-url',
    };

    const result = profileFormSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects blank fullName or departmentUnit', () => {
    const input = {
      fullName: '   ',
      departmentUnit: '',
      availabilityStatus: 'OPEN_FOR_COLLABORATION',
    };

    const result = profileFormSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
