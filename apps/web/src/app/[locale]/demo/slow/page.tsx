import { io } from 'next/cache';
import { setTimeout } from 'node:timers/promises';

/**
 * Route that suspends for a few seconds, used to exercise the segment's
 * `loading.tsx` fallback.
 *
 * `io()` keeps this out of the static shell so the page renders per request
 * rather than being prerendered with a resolved value.
 */
export default async function SlowPage() {
  await io();
  await setTimeout(3000);
  return (
    <main>
      <h1>Tải xong sau 3 giây</h1>
      <p>Trang này dùng `await io()` nên không được prerender.</p>
    </main>
  );
}
