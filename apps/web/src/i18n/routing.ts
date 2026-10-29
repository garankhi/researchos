import { defineRouting } from 'next-intl/routing';

/**
 * Routing configuration for ResearchOS.
 *
 * The locale lives in the URL (`/vi`, `/en`), which means:
 * - every page is addressable in both languages,
 * - search engines can index each language separately,
 * - the locale survives a shared link.
 *
 * `localePrefix: 'always'` keeps the prefix on every locale, including the
 * default one. A mixed scheme (`/vi` vs `/`) makes the default locale
 * invisible in the URL and creates two ways to reach the same page, which
 * then needs a canonical link to avoid duplicate content.
 */
export const routing = defineRouting({
  locales: ['vi', 'en'],
  defaultLocale: 'vi',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

/**
 * Narrows an arbitrary string to a supported locale.
 *
 * The `[locale]` segment is a catch-all in practice: `/unknown.txt` also
 * matches it. This guard turns that into a 404 instead of a runtime error.
 */
export function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

/**
 * Human readable name of a locale, in that locale.
 *
 * A language switcher shows the names in the languages themselves: someone
 * who reads Vietnamese should see "Tiếng Việt", not "Vietnamese".
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
};
