import { unauthorized } from 'next/navigation';
import { connection } from 'next/server';

/**
 * Triggers the `unauthorized.tsx` boundary by calling `unauthorized()`.
 *
 * Requires `experimental.authInterrupts: true` in next.config.ts.
 *
 * `connection()` makes the render request-time only. Without it the route is
 * prerendered during `next build`, and `unauthorized()` during a prerender
 * cannot interrupt the render — Next falls back to client rendering and the
 * boundary never renders.
 *
 * `instant = false` allows a blocking render. `connection()` outside a
 * `<Suspense>` boundary would otherwise be an error under
 * `cacheComponents`, and the boundary cannot be wrapped in Suspense here:
 * the point of the route is to interrupt the render.
 */
export const instant = false;

export default async function UnauthorizedDemoPage() {
  await connection();
  unauthorized();
}
