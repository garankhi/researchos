import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { genericErrorCodeList } from './error-codes.js';

/**
 * The generic error codes must exist in the frontend's message catalog.
 *
 * The backend's generic codes and the frontend's catalog are two separate
 * lists, and nothing else keeps them in step. A code that the backend can
 * emit but the catalog does not have is a **silent** failure: the frontend
 * falls back to a generic message, so the user sees a wrong-but-plausible
 * error and no test anywhere fails.
 *
 * This spec closes that gap. It reads the real catalogs from disk and
 * fails when a generic code has no entry in either locale.
 *
 * The domain codes are not checked here: they are defined per module, and
 * a module's own spec is where its codes belong.
 */

const WEB_MESSAGES = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'messages',
);

type Catalog = {
  errors?: {
    codes?: Record<string, unknown> & {
      domain?: Record<string, unknown>;
    };
  };
};

function readCatalog(locale: 'en' | 'vi'): Catalog {
  const path = resolve(WEB_MESSAGES, `${locale}.json`);

  return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
}

/**
 * The generic codes live at the top level of `errors.codes`. The domain
 * codes live under `errors.codes.domain`, so the two cannot collide.
 */
function genericCodesOf(catalog: Catalog): Record<string, unknown> {
  return catalog.errors?.codes ?? {};
}

describe('the error code catalog', () => {
  it('has an entry for every generic code the backend can emit', () => {
    for (const locale of ['en', 'vi'] as const) {
      const codes = genericCodesOf(readCatalog(locale));

      for (const code of genericErrorCodeList) {
        expect(
          Object.hasOwn(codes, code),
          `the '${locale}' catalog has no entry for the generic code '${code}'`,
        ).toBe(true);
      }
    }
  });

  it('keeps the domain codes in their own namespace', () => {
    // A domain code at the top level would shadow a generic code, and a
    // generic code under `domain` would be unreachable. Both are mistakes
    // the split is meant to prevent.
    for (const locale of ['en', 'vi'] as const) {
      const catalog = readCatalog(locale);
      const codes = genericCodesOf(catalog);

      for (const code of genericErrorCodeList) {
        expect(
          Object.hasOwn(codes.domain ?? {}, code),
          `the generic code '${code}' is duplicated under 'errors.codes.domain' in '${locale}'`,
        ).toBe(false);
      }
    }
  });

  it('has the same codes in both locales', () => {
    const en = Object.keys(genericCodesOf(readCatalog('en')));
    const vi = Object.keys(genericCodesOf(readCatalog('vi')));

    expect(en.sort()).toEqual(vi.sort());
  });
});
