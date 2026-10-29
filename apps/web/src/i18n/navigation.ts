import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation helpers.
 *
 * Use these instead of `next/link` and `next/navigation`:
 *
 * - `Link` keeps the current locale in the URL, so a link does not silently
 *   switch the user back to the default language.
 * - `useRouter` and `usePathname` understand the locale prefix, so
 *   `usePathname()` returns `/about` rather than `/vi/about`.
 *
 * The helpers are created from the same `routing` config the proxy uses, so
 * the two can never disagree about which locales exist.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
