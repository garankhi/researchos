import { describe, expect, it, vi } from 'vitest';
import {
  codeKey,
  resolveErrorCode,
  resolveFieldErrorCodes,
  type ErrorTranslator,
} from './error-messages';

/**
 * The error-code resolution is the boundary between the backend's machine
 * codes and the user's language.
 *
 * The backend sends codes, never sentences: `message` carries one code for
 * the whole failure, and `errors[].messages` carries one code per field
 * constraint. Both are resolved here before they reach a user.
 *
 * The failure mode is quiet and wrong rather than loud: an unresolved code
 * that renders raw shows the user `title_required`, and a code that
 * resolves into the wrong tier shows a plausible but incorrect sentence.
 * Both are what these specs pin down.
 */

/**
 * A translator backed by a plain object, standing in for the real
 * `next-intl` translator.
 */
function translatorFor(codes: Record<string, string>): ErrorTranslator {
  const translate = (key: string): string => codes[key] ?? key;

  translate.has = (key: string): boolean => Object.hasOwn(codes, key);

  return translate;
}

/**
 * The catalog, keyed by the full path the resolver builds.
 */
const CATALOG = {
  'codes.server_error': 'Something went wrong. Please try again later.',
  'codes.validation_failed': 'The submitted data is invalid.',
  'codes.not_found': 'The requested data was not found.',
  'codes.fields.title_required': 'Title is required.',
  'codes.fields.title_invalid': 'Title must be a string.',
  'codes.fields.email_invalid': 'Email is invalid.',
  'codes.domain.opportunity_not_found': 'The opportunity was not found.',
};

describe('codeKey', () => {
  it('puts the generic tier at the top level of `errors.codes`', () => {
    expect(codeKey('not_found')).toBe('codes.not_found');
  });

  it('puts the field tier under `codes.fields`', () => {
    expect(codeKey('title_required', 'field')).toBe(
      'codes.fields.title_required',
    );
  });

  it('puts the domain tier under `codes.domain`', () => {
    expect(codeKey('opportunity_not_found', 'domain')).toBe(
      'codes.domain.opportunity_not_found',
    );
  });
});

describe('resolveErrorCode', () => {
  it('resolves a code against the catalog', () => {
    const t = translatorFor(CATALOG);

    expect(resolveErrorCode(t, 'not_found', 'fallback')).toBe(
      'The requested data was not found.',
    );
  });

  it('resolves a field code against the field tier', () => {
    const t = translatorFor(CATALOG);

    expect(resolveErrorCode(t, 'title_required', 'fallback', 'field')).toBe(
      'Title is required.',
    );
  });

  it('resolves a domain code against the domain tier', () => {
    const t = translatorFor(CATALOG);

    expect(
      resolveErrorCode(t, 'opportunity_not_found', 'fallback', 'domain'),
    ).toBe('The opportunity was not found.');
  });

  it('falls back to the given fallback when the code is unknown', () => {
    const t = translatorFor(CATALOG);

    expect(resolveErrorCode(t, 'a_code_nobody_knows', 'fallback')).toBe(
      'fallback',
    );
  });

  it('never returns a raw code', () => {
    const t = translatorFor(CATALOG);

    // Whatever the input, the output is either a catalog entry or the
    // fallback — never the code itself.
    for (const code of ['not_found', 'a_code_nobody_knows', '']) {
      const resolved = resolveErrorCode(t, code || undefined, 'fallback');

      expect(resolved).not.toBe(code);
    }
  });

  it('returns the fallback when there is no code at all', () => {
    const t = translatorFor(CATALOG);

    expect(resolveErrorCode(t, undefined, 'fallback')).toBe('fallback');
  });

  it('finds a code that lives in another tier than the one hinted', () => {
    const t = translatorFor(CATALOG);

    // The kind is a hint, not a guarantee: every tier is tried, so the
    // code resolves wherever it actually is.
    expect(resolveErrorCode(t, 'not_found', 'fallback', 'field')).toBe(
      'The requested data was not found.',
    );
  });

  it('warns in development about a code with no catalog entry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    resolveErrorCode(translatorFor(CATALOG), 'a_code_nobody_knows', 'fallback');

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('a_code_nobody_knows');

    warn.mockRestore();
  });
});

describe('resolveFieldErrorCodes', () => {
  it("resolves each field's codes and joins them", () => {
    const t = translatorFor(CATALOG);

    const resolved = resolveFieldErrorCodes(
      t,
      {
        title: ['title_required', 'title_invalid'],
        email: ['email_invalid'],
      },
      'fallback',
    );

    expect(resolved).toEqual({
      title: 'Title is required., Title must be a string.',
      email: 'Email is invalid.',
    });
  });

  it('returns undefined when there are no codes at all', () => {
    const t = translatorFor(CATALOG);

    expect(resolveFieldErrorCodes(t, undefined, 'fallback')).toBeUndefined();
  });

  it('falls back for a field code the catalog does not have', () => {
    const t = translatorFor(CATALOG);

    const resolved = resolveFieldErrorCodes(
      t,
      { title: ['a_code_nobody_knows'] },
      'fallback',
    );

    expect(resolved).toEqual({ title: 'fallback' });
  });

  it('never returns a raw code', () => {
    const t = translatorFor(CATALOG);

    const resolved = resolveFieldErrorCodes(
      t,
      { title: ['a_code_nobody_knows'] },
      'fallback',
    );

    expect(resolved?.title).not.toBe('a_code_nobody_knows');
  });
});
