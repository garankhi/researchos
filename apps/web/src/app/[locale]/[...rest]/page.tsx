import { notFound } from 'next/navigation';
import { connection } from 'next/server';

/**
 * Catch-all for unmatched URLs under a valid locale.
 *
 * Without this, `/vi/nope` matches no route, so Next.js renders its
 * default 404 instead of `app/[locale]/not-found.tsx` — a nested
 * `not-found.tsx` only renders when `notFound()` is called inside its
 * segment. This route calls it for any unmatched path, so the localized
 * 404 renders with the app shell (header, theme, providers).
 *
 * `connection()` keeps the throw at request time: under `cacheComponents`
 * a route that always throws at render time would fail `next build`
 * instead of rendering the boundary at runtime.
 *
 * `instant = false` opts this route out of static-shell validation: the
 * shared `[locale]` layout reads the pathname in the header, which is
 * only available at request time, so there is no static shell to validate.
 */
export const instant = false;

export default async function LocaleCatchAll() {
  await connection();
  notFound();
}
