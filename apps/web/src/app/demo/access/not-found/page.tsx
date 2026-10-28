import { notFound } from 'next/navigation';

/**
 * Triggers the `not-found.tsx` boundary by calling `notFound()`.
 *
 * `notFound()` only works during a server render, so it cannot be fired from
 * a client-side button handler. A dedicated route is the way to exercise it.
 */
export default function NotFoundDemoPage() {
  notFound();
}
