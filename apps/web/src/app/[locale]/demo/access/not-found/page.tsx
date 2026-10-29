import { notFound } from 'next/navigation';
import { connection } from 'next/server';

/**
 * Triggers the `not-found.tsx` boundary by calling `notFound()`.
 *
 * `notFound()` only works during a server render, so it cannot be fired from
 * a client-side button handler. A dedicated route is the way to exercise it.
 *
 * `connection()` makes the render request-time only. Without it the route is
 * prerendered during `next build`, and `notFound()` during a prerender
 * cannot interrupt the render — Next falls back to client rendering and the
 * boundary never renders.
 *
 * `instant = false` allows a blocking render. `connection()` outside a
 * `<Suspense>` boundary would otherwise be an error under
 * `cacheComponents`, and the boundary cannot be wrapped in Suspense here:
 * the point of the route is to interrupt the render.
 */
export const instant = false;

export default async function NotFoundDemoPage() {
  await connection();
  notFound();
}
