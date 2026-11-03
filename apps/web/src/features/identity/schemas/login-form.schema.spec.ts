import { describe, expect, it } from 'vitest';
import { loginFormSchema } from './login-form.schema';

/**
 * The schema is the frontend's half of the credential rules. The backend
 * enforces the same rules on `LoginDto` and sends the same codes back,
 * so a code that drifts on one side shows up as a different wording on
 * the screen.
 *
 * The messages here are **codes**, not sentences — the catalog holds the
 * wording.
 */
describe('loginFormSchema', () => {
  it('accepts a well-formed credential', () => {
    const result = loginFormSchema.safeParse({
      email: 'faculty@researchos.local',
      password: 'ResearchOS!Dev2026',
    });

    expect(result.success).toBe(true);
  });

  it('trims the email before it is checked', () => {
    const result = loginFormSchema.safeParse({
      email: '  faculty@researchos.local  ',
      password: 'ResearchOS!Dev2026',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('faculty@researchos.local');
    }
  });

  it('rejects an empty email with the required code', () => {
    const result = loginFormSchema.safeParse({
      email: '   ',
      password: 'ResearchOS!Dev2026',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('email_required');
    }
  });

  it('rejects a malformed email with the invalid code', () => {
    const result = loginFormSchema.safeParse({
      email: 'not-an-email',
      password: 'ResearchOS!Dev2026',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('email_invalid');
    }
  });

  it('rejects an email longer than the column with the too-long code', () => {
    const result = loginFormSchema.safeParse({
      email: `${'a'.repeat(250)}@researchos.local`,
      password: 'ResearchOS!Dev2026',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('email_too_long');
    }
  });

  it('rejects an empty password with the required code', () => {
    const result = loginFormSchema.safeParse({
      email: 'faculty@researchos.local',
      password: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('password_required');
    }
  });

  it('rejects a password longer than the limit with the too-long code', () => {
    const result = loginFormSchema.safeParse({
      email: 'faculty@researchos.local',
      password: 'a'.repeat(1025),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('password_too_long');
    }
  });
});
