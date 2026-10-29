import { LoadingSkeleton } from '@/components/ui/feedback';

/**
 * Route-segment loading fallback for `/demo/*`.
 *
 * Next.js renders this while a nested segment is still resolving, so it
 * covers `/demo/slow` and any other suspending child route.
 */
export default function DemoLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <LoadingSkeleton variant="rectangular" height={48} width="40%" />
      <div className="mt-6 space-y-4">
        <LoadingSkeleton variant="rectangular" height={120} />
        <LoadingSkeleton variant="rectangular" height={220} />
      </div>
    </main>
  );
}
