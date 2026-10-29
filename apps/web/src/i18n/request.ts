import { hasLocale } from 'next-intl';
import { locale } from 'next/root-params';
import { routing } from './routing';

/**
 * Request configuration for `next-intl`.
 *
 * This module is the single place that decides which message catalog is
 * loaded for a request. `next-intl` aliases `next-intl/config` to this
 * file, so it must be the default export and must not import from
 * `next-intl/server` — that would create a cycle.
 *
 * The locale is read from the `[locale]` route segment through
 * `next/root-params`, not from the request headers:
 *
 * - The URL is the source of truth. The proxy resolves the locale and puts
 *   it in the path; reading it back keeps the server and the client on the
 *   same locale.
 * - Reading a header would opt the whole route into dynamic rendering,
 *   which breaks the prerender of each locale under `cacheComponents`.
 */
export default async function getRequestConfig() {
  const requested = await locale();

  // The `[locale]` segment also catches unknown paths, so the value is not
  // guaranteed to be a supported locale.
  const localeValue = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale: localeValue,
    messages: (await import(`../messages/${localeValue}.json`)).default,
    // Formats dates, numbers and relative times in the active locale.
    formats: {
      dateTime: {
        short: { dateStyle: 'short' },
        long: { dateStyle: 'long' },
      },
      number: {
        precise: { maximumFractionDigits: 4 },
      },
    },
  };
}
