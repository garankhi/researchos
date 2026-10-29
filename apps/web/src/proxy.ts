import createProxy from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * Locale routing for every request.
 *
 * The proxy (formerly "middleware") runs before the route renders. It:
 * - redirects `/` to `/vi` (or the locale negotiated from the cookie and
 *   the `Accept-Language` header),
 * - redirects `/about` to `/vi/about`,
 * - sets the `x-next-intl-locale` header so the server knows the locale
 *   without re-deriving it,
 * - emits `Link` headers for the alternate locales, so search engines can
 *   index each language separately.
 *
 * The matcher excludes Next.js internals, the API and any file with an
 * extension — otherwise the proxy would try to localise `favicon.ico`.
 */
export default createProxy(routing);

export const config = {
  matcher: [
    /*
     * Match every path except:
     * - /api (backend routes)
     * - /_next (build output)
     * - paths with a file extension (static assets)
     */
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
