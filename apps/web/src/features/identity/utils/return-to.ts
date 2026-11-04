/**
 * Where to send the user after signing in.
 *
 * A protected screen sends the visitor to the login screen with a
 * `returnTo` parameter naming the page they wanted. After the login the
 * user goes back there instead of the home page.
 *
 * ## Why the value is sanitized
 *
 * `returnTo` arrives from the URL, so it is attacker-controlled. Passing it
 * to a redirect without checking it is an **open redirect**: a link like
 * `/login?returnTo=https://evil.example` would send the user  and their
 * freshly issued session cookie  off the site after they signed in.
 *
 * The rules below are what make the value safe:
 *
 * 1. it must start with a single `/`, so it is a path on this site;
 * 2. it must not start with `//`, which is a protocol-relative URL and
 *    points at another host;
 * 3. it must not contain a backslash, which some browsers normalise to a
 *    slash and would turn `/\evil.example` into `//evil.example`;
 * 4. it must not contain a control character, which can truncate the
 *    value before the check runs.
 *
 * Anything that fails a rule falls back to the home page, so a hostile
 * value can never redirect the user off the site.
 */

import { routing } from '@/i18n/routing';

/**
 * The query parameter that carries the page to return to.
 */
export const RETURN_TO_PARAM = 'returnTo';

/**
 * The path the user lands on when no (valid) `returnTo` was given.
 */
export const DEFAULT_RETURN_TO = '/';

/**
 * Returns `true` when the value holds a control character  a C0 code or
 * DEL.
 *
 * A control character in a URL can truncate the value before the checks
 * below run, which is how a URL parser ends up reading a different host
 * than the one the check looked at.
 *
 * The check is done on the character codes rather than with a regular
 * expression, because a literal control character cannot be written in a
 * source file without being invisible, and an escape sequence inside a
 * character class trips the `no-control-regex` lint rule.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}

/**
 * Returns `true` when the value is a path that stays on this site.
 *
 * Exported so the rule can be tested on its own, and so a caller can
 * explain *why* a value was rejected.
 */
export function isSafeReturnTo(value: string): boolean {
  if (!value) {
    return false;
  }

  if (hasControlCharacter(value)) {
    return false;
  }

  // Must be a path, not an absolute URL.
  if (!value.startsWith('/')) {
    return false;
  }

  // `//host` is a protocol-relative URL  another host.
  if (value.startsWith('//')) {
    return false;
  }

  // Some browsers normalise `\` to `/`, so `/\host` would become
  // `//host`.
  if (value.includes('\\')) {
    return false;
  }

  return true;
}

/**
 * Removes a leading locale prefix from a path.
 *
 * The locale-aware router adds the prefix itself, so a value that already
 * carries one would end up doubled  `/vi/demo` becoming `/vi/vi/demo`.
 *
 * The prefix is only stripped when the rest of the path is still a safe
 * path, so stripping can never turn an unsafe value into a different
 * unsafe one.
 */
function stripLocalePrefix(value: string): string {
  for (const locale of routing.locales) {
    if (value === `/${locale}`) {
      return DEFAULT_RETURN_TO;
    }

    if (value.startsWith(`/${locale}/`)) {
      const rest = value.slice(locale.length + 1);

      return isSafeReturnTo(rest) ? rest : DEFAULT_RETURN_TO;
    }
  }

  return value;
}

/**
 * Reads the page to return to out of a search-parameter record.
 *
 * The record is the one `useSearchParams()` returns. Only its `get` is
 * used, so the shape is the smallest one that works — a `URLSearchParams`
 * and a `ReadonlyURLSearchParams` both satisfy it.
 *
 * A repeated parameter is read once, which is what `get` does. Anything
 * that is not a single safe path falls back to the home page.
 */
export function resolveReturnTo(
  searchParams: { get: (name: string) => string | null } | undefined,
): string {
  const value = searchParams?.get(RETURN_TO_PARAM);

  if (!value || !isSafeReturnTo(value)) {
    return DEFAULT_RETURN_TO;
  }

  return stripLocalePrefix(value);
}

/**
 * Builds the login URL that remembers where the user was.
 *
 * This is the other half of `resolveReturnTo`: the header puts the page
 * the user is on into the link to the login screen, and the login screen
 * reads it back. Without this the visitor signs in and lands on the home
 * page, having lost the page they came for.
 *
 * The path is the **locale-free** pathname, because the locale-aware
 * router adds the prefix itself — `/vi/demo` would become `/vi/vi/demo`.
 *
 * The value is sanitized on the way in as well as on the way out. A
 * hostile value is harmless here — it is the reader that has to trust
 * it — but a link that carries an absolute URL to another site is a
 * phishing link, and the sanitizer is the one place that knows the rules.
 */
export function buildLoginHref(pathname: string): string {
  const path = stripLocalePrefix(pathname);

  const params = new URLSearchParams();
  params.set(RETURN_TO_PARAM, path);

  return `/login?${params.toString()}`;
}
