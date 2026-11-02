import type { ErrorCode } from '@/lib/api-error';

/**
 * The subset of `next-intl`'s translator this module needs.
 *
 * `t.has()` returns `false` for a key that is not in the catalog — it does
 * not throw — so guarding on it is what stops `t()` from rendering a raw
 * key.
 *
 * The signature is deliberately loose: the key is a plain `string` because
 * it is built at runtime from a code, and the values parameter is left out
 * so a real translator from `useTranslations` or `getTranslations` stays
 * assignable to it.
 */
export type ErrorTranslator = {
  (key: string): string;
  has?: (key: string) => boolean;
};

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
 * The backend sends codes, so a code with no catalog entry means the
 * catalog has not caught up with a newly added code — not that the server
 * sent prose. Either way the fallback is what renders.
 */
export function resolveErrorCode(
  t: ErrorTranslator,
  code: ErrorCode | undefined,
  fallback: string,
): string {
  if (!code) {
    return fallback;
  }

  const key = `codes.${code}`;

  if (t.has && !t.has(key)) {
    return fallback;
  }

  try {
    return t(key);
  } catch {
    return fallback;
  }
}

/**
 * Resolves a set of field-level validation codes into one message per
 * field.
 *
 * Several constraints can fail on the same field, so each field's codes
 * are resolved and joined. The result is keyed by field name, ready to be
 * rendered next to the input that caused it.
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
      .map((code) => resolveErrorCode(t, code, fallback))
      .join(', ');
  }

  return resolved;
}
