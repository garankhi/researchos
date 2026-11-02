import type { ErrorCode } from '@/lib/api-error';

/**
 * The subset of `next-intl`'s translator this module needs.
 *
 * `t.has()` returns `false` for a key that is not in the catalog — it does
 * not throw — so guarding on it is what stops `t()` from rendering a raw
 * key.
 *
 * `has` is **required**, not optional. Every real translator has it, so
 * making it optional would only create a second, subtler behavior that a
 * caller has to reason about. With it required, the resolution is one
 * path: look the key up, and fall back when it is not there.
 *
 * The key is a plain `string` because it is built at runtime from a code,
 * and the values parameter is left out so a real translator from
 * `useTranslations` or `getTranslations` stays assignable to it.
 */
export type ErrorTranslator = {
  (key: string): string;
  has: (key: string) => boolean;
};

/**
 * Where a code lives in the `errors.codes` namespace.
 *
 * The catalog has three tiers, and each tier has one owner:
 *
 * | Tier | Owner | Grows with |
 * | --- | --- | --- |
 * | `codes.*` | The backend | The HTTP status set — fixed |
 * | `codes.fields.*` | The forms | The fields that can fail validation |
 * | `codes.domain.*` | Each module | That module's domain codes |
 *
 * Splitting them means a module can never shadow a generic code by
 * accident, and it makes it obvious where a new entry belongs.
 */
export type CodeKind = 'generic' | 'field' | 'domain';

/**
 * The catalog path for each tier.
 *
 * The tier is called `field` in code and `fields` in the catalog. The
 * mapping lives here so the two names cannot drift, and so every lookup
 * goes through one place.
 */
const TIER_PATH: Record<CodeKind, string> = {
  generic: '',
  field: 'fields',
  domain: 'domain',
};

/**
 * The catalog key for a code in one tier.
 *
 * The generic tier sits at the top level of `errors.codes`; the other two
 * are nested under it.
 */
export function codeKey(code: ErrorCode, kind: CodeKind = 'generic'): string {
  const tier = TIER_PATH[kind];

  return tier ? `codes.${tier}.${code}` : `codes.${code}`;
}

/**
 * The kinds a code is looked up in, in order.
 */
const LOOKUP_ORDER: CodeKind[] = ['generic', 'field', 'domain'];

/**
 * Resolves a backend error code against the `errors.codes` namespace of the
 * message catalog.
 *
 * The backend sends codes, not sentences: `message` carries one code for
 * the whole failure, and `errors[].messages` carries one code per field
 * constraint. Both are resolved through here before they reach a user.
 *
 * A code with no catalog entry degrades to `fallback` — a localized string
 * the component already owns — never to a blank error and never to a raw
 * `snake_case` string on screen.
 *
 * A missing entry is a **bug in the catalog**, not a normal state: the
 * backend can emit a code the frontend does not have. In development the
 * gap is logged, so it is visible instead of silently degrading to a
 * wrong-but-plausible message.
 */
export function resolveErrorCode(
  t: ErrorTranslator,
  code: ErrorCode | undefined,
  fallback: string,
  kind: CodeKind = 'generic',
): string {
  if (!code) {
    return fallback;
  }

  // The kind is a hint, not a guarantee: a code the caller thinks is a
  // field code may still live in another tier. Every tier is tried, so the
  // code resolves wherever it actually is.
  const kinds =
    kind === 'generic'
      ? LOOKUP_ORDER
      : [kind, ...LOOKUP_ORDER.filter((k) => k !== kind)];

  for (const candidate of kinds) {
    const key = codeKey(code, candidate);

    if (t.has(key)) {
      return t(key);
    }
  }

  warnMissingCode(code);

  return fallback;
}

/**
 * Logs a code that has no catalog entry.
 *
 * Only in development. In production the fallback is the right thing to
 * show, and a warning in the console would be noise for every user who
 * hits a code the catalog has not caught up with.
 */
function warnMissingCode(code: ErrorCode): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.warn(
    `[i18n] The error code "${code}" has no entry in the message catalog ` +
      `(looked in ${LOOKUP_ORDER.join(', ')}). Add it to errors.codes in ` +
      `every locale.`,
  );
}

/**
 * Resolves a set of field-level validation codes into one message per
 * field.
 *
 * Several constraints can fail on the same field, so each field's codes
 * are resolved and joined. The result is keyed by field name, ready to be
 * rendered next to the input that caused it.
 *
 * The keys are the **backend's** field paths (`title`, `items.0.name`).
 * They are not automatically the form's field names — a form decides which
 * server field maps to which input, because only the form knows how its
 * fields are named.
 */
export function resolveFieldErrorCodes(
  t: ErrorTranslator,
  codes: Record<string, ErrorCode[]> | undefined,
  fallback: string,
): Record<string, string> | undefined {
  if (!codes) {
    return undefined;
  }

  const resolved: Record<string, string> = {};

  for (const [field, fieldCodes] of Object.entries(codes)) {
    resolved[field] = fieldCodes
      .map((code) => resolveErrorCode(t, code, fallback, 'field'))
      .join(', ');
  }

  return resolved;
}
