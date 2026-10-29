'use client';

import { Link } from '@/i18n/navigation';

/**
 * Client wrapper around the locale-aware `Link`.
 *
 * Two reasons this exists instead of importing `next/link` directly:
 *
 * 1. Next.js 16 rejects functions passed from a Server Component to a Client
 *    Component, so `<Button component={NextLink}>` fails with "Functions
 *    cannot be passed directly to Client Components". Wrapping the Link in a
 *    module marked 'use client' makes it a valid component reference.
 *
 * 2. `next/link` does not know about the locale prefix, so a link to `/demo`
 *    would drop the user out of their language. The `Link` from
 *    `@/i18n/navigation` keeps the current locale in the href.
 *
 * Use this wrapper with MUI's `component` prop. Do not use `as={Link}`.
 */
export default Link;
