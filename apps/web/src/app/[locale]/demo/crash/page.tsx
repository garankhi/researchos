import { connection } from 'next/server';

/**
 * Route that always throws, used to exercise `app/demo/error.tsx`.
 *
 * `connection()` makes the render request-time only. Without it the page is
 * prerendered during `next build`, the throw happens at build time and the
 * build fails instead of the error boundary rendering at runtime.
 */
export default async function CrashPage() {
  await connection();
  throw new Error('Lỗi cố ý ở cấp route');
}
