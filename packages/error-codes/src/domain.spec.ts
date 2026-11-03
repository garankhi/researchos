import { describe, expect, it } from 'vitest';
import {
  domainErrorCodeList,
  domainErrorCodes,
  isDomainErrorCode,
} from './domain.js';

/**
 * The registry's own invariants.
 *
 * The registry is the single source of truth for the domain error codes:
 * the API raises the codes from it, and the frontend's catalog check
 * compares against it. Its shape is therefore worth checking here, where
 * the registry lives, rather than only from the consumer's side.
 *
 * The catalog check itself lives in `apps/web/src/utils/error-codes.spec.ts`
 * — it reads the frontend's message catalogs, so it belongs to the web
 * app.
 */
describe('the domain code registry', () => {
  it('lists every registered code', () => {
    const expected = Object.values(domainErrorCodes).flatMap((codes) =>
      Object.values(codes),
    );

    expect(domainErrorCodeList.sort()).toEqual(expected.sort());
  });

  it('has no duplicate codes', () => {
    // A duplicate would mean two modules claim the same code, and the
    // catalog check could not tell which one owns it.
    expect(new Set(domainErrorCodeList).size).toBe(domainErrorCodeList.length);
  });

  it('registers no module with an empty code list', () => {
    // An empty entry is a module that was started and not finished. It
    // would read as "this module has codes" while contributing none.
    for (const [module, codes] of Object.entries(domainErrorCodes)) {
      expect(
        Object.keys(codes).length,
        `the module '${module}' is registered with no codes`,
      ).toBeGreaterThan(0);
    }
  });

  it('uses codes that look like codes', () => {
    // A code travels in the envelope's `message` and is resolved as a
    // catalog key. The filter only keeps a message that looks like a
    // `snake_case` code, so a code that does not match would be replaced
    // by the generic one for the status — silently.
    for (const code of domainErrorCodeList) {
      expect(code).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    }
  });

  it('recognizes a registered code', () => {
    for (const code of domainErrorCodeList) {
      expect(isDomainErrorCode(code)).toBe(true);
    }
  });

  it('does not recognize an unregistered code', () => {
    expect(isDomainErrorCode('not_a_registered_code')).toBe(false);
  });
});
