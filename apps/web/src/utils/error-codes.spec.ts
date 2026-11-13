import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  domainErrorCodeList,
  domainErrorCodes,
  genericErrorCodeList,
  isDomainErrorCode,
} from '@researchos/error-codes';

/**
 * The error codes must exist in the frontend's message catalog.
 *
 * The backend's codes and the frontend's catalog are two separate lists,
 * and nothing else keeps them in step. A code that the backend can emit
 * but the catalog does not have is a **silent** failure: the frontend
 * falls back to a generic message, so the user sees a wrong-but-plausible
 * error and no test anywhere fails.
 *
 * This spec closes that gap. It reads the real catalogs from disk and
 * fails when a code has no entry in either locale.
 *
 * It lives here, in the web app, rather than in the API: the thing being
 * checked is the *frontend's* catalog, so the frontend's test runner is
 * its natural home. The code lists themselves come from
 * `@researchos/error-codes`, so the API and this spec read the same lists
 * and neither package reaches into the other's folder.
 *
 * ## The three tiers
 *
 * | Tier | Who owns it | Checked here |
 * | --- | --- | --- |
 * | `errors.codes.*` | The backend — the fixed generic set | Yes |
 * | `errors.codes.fields.*` | The validation constraints | Yes |
 * | `errors.codes.domain.*` | Each module, through the registry | Yes |
 *
 * The domain tier used to be the one gap: a module's codes were its own
 * responsibility, and nothing checked them. They are registered in
 * `@researchos/error-codes` now, so this spec covers them the same way
 * it covers the rest.
 */

const MESSAGES = resolve(import.meta.dirname, '..', 'messages');

type Catalog = {
  errors?: {
    codes?: Record<string, unknown> & {
      fields?: Record<string, unknown>;
      domain?: Record<string, unknown>;
    };
  };
};

function readCatalog(locale: 'en' | 'vi'): Catalog {
  const path = resolve(MESSAGES, `${locale}.json`);

  return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
}

/**
 * The generic codes live at the top level of `errors.codes`. The domain
 * codes live under `errors.codes.domain`, so the two cannot collide.
 */
function genericCodesOf(catalog: Catalog): Record<string, unknown> {
  return catalog.errors?.codes ?? {};
}

/**
 * The domain codes live under `errors.codes.domain`.
 *
 * They are the module's own codes — `opportunity_not_found` and its
 * siblings — and they are checked against the registry in
 * `@researchos/error-codes`.
 */
function domainCodesOf(catalog: Catalog): Record<string, unknown> {
  return catalog.errors?.codes?.domain ?? {};
}

/**
 * The field codes live under `errors.codes.fields`.
 *
 * The tier is named `fields` in the catalog and `field` in the frontend's
 * `CodeKind`. A mismatch between the two would make every validation code
 * fall back to the generic message — a failure that shows a plausible
 * wrong string rather than an obvious break, so it needs a test.
 */
function fieldCodesOf(catalog: Catalog): Record<string, unknown> {
  return catalog.errors?.codes?.fields ?? {};
}

/**
 * Every code the frontend's resolver can look up, across both tiers.
 *
 * The frontend's resolver is `apps/web/src/utils/error-messages.ts`. The
 * lookup order and the tier paths are duplicated here on purpose: this
 * spec is the check that the two stay in step, so it cannot import the
 * values it is meant to verify.
 */
const RESOLVED_CODES = [
  ...genericErrorCodeList,
  'title_required',
  'title_invalid',
  'title_too_long',
  'email_required',
  'email_invalid',
  'status_invalid',
  'status_required',
  'email_already_registered',
  'expected_role_invalid',
  'application_deadline_invalid',
  'archived_at_invalid',
];

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

  it('resolves every code through the tier paths the frontend uses', () => {
    // The frontend's resolver walks the tiers in this order and builds
    // the key from the tier path. A code that is in the catalog but under
    // the wrong path would be found by a naive "does the key exist
    // anywhere" check, and missed by the real one.
    const TIERS = [genericCodesOf, fieldCodesOf];

    for (const locale of ['en', 'vi'] as const) {
      const catalog = readCatalog(locale);

      for (const code of RESOLVED_CODES) {
        const found = TIERS.some((codes) =>
          Object.hasOwn(codes(catalog), code),
        );

        expect(
          found,
          `the '${locale}' catalog has no entry for '${code}' under 'codes' or 'codes.fields'`,
        ).toBe(true);
      }
    }
  });

  it('has the same field codes in both locales', () => {
    const en = Object.keys(fieldCodesOf(readCatalog('en')));
    const vi = Object.keys(fieldCodesOf(readCatalog('vi')));

    expect(en.sort()).toEqual(vi.sort());
  });
});

describe('the domain error codes', () => {
  it('has an entry for every registered domain code', () => {
    // The registry is the list of codes the backend can emit as a domain
    // code. Every one of them needs an entry under `errors.codes.domain`
    // in both locales, or the frontend falls back to a generic message
    // and the user never learns what actually failed.
    for (const locale of ['en', 'vi'] as const) {
      const codes = domainCodesOf(readCatalog(locale));

      for (const code of domainErrorCodeList) {
        expect(
          Object.hasOwn(codes, code),
          `the '${locale}' catalog has no entry for the domain code '${code}'`,
        ).toBe(true);
      }
    }
  });

  it('has the same domain codes in both locales', () => {
    // One locale missing an entry means the code resolves in English and
    // falls back in Vietnamese — the user reads a different message
    // depending on the language they picked.
    const en = Object.keys(domainCodesOf(readCatalog('en')));
    const vi = Object.keys(domainCodesOf(readCatalog('vi')));

    expect(en.sort()).toEqual(vi.sort());
  });

  it('has no catalog entry for a code that was never registered', () => {
    // A leftover from a renamed code. It is unreachable — nothing raises
    // it — so it only adds noise to the catalog.
    for (const locale of ['en', 'vi'] as const) {
      const codes = domainCodesOf(readCatalog(locale));

      for (const code of Object.keys(codes)) {
        expect(
          isDomainErrorCode(code),
          `the '${locale}' catalog has the domain code '${code}', which no module registers`,
        ).toBe(true);
      }
    }
  });

  it('keeps the domain codes out of the generic tier', () => {
    // A domain code at the top level would shadow a generic code, and the
    // resolver would find the generic one first — so the domain code would
    // never be reached.
    for (const locale of ['en', 'vi'] as const) {
      const generic = genericCodesOf(readCatalog(locale));
      const domain = domainCodesOf(readCatalog(locale));

      for (const code of Object.keys(domain)) {
        expect(
          Object.hasOwn(generic, code),
          `the domain code '${code}' is duplicated at the top level of 'errors.codes' in '${locale}'`,
        ).toBe(false);
      }
    }
  });

  it('registers every module under its own name', () => {
    // The registry is keyed by module, so the codes a module owns are
    // visible at a glance. A module with no codes yet should not be
    // listed with an empty object.
    for (const [module, codes] of Object.entries(domainErrorCodes)) {
      expect(
        Object.keys(codes).length,
        `the module '${module}' is registered with no codes`,
      ).toBeGreaterThan(0);
    }
  });
});
