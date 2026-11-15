import { RouteLoadingSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * Route-level loading UI.
 *
 * `loading.tsx` wraps `page.tsx` and `not-found.tsx` in a Suspense boundary.
 * It does NOT cover the segment's own `layout.tsx`: a layout that reads
 * uncached runtime data (cookies, headers, uncached fetches) needs its own
 * Suspense boundary for the fallback to appear.
 */
export default function Loading() {
  return <RouteLoadingSkeleton />;
}
