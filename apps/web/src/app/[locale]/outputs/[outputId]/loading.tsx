import { LoadingSkeleton } from '@/components/ui/feedback';

/**
 * Route-level loading UI for the publication detail segment.
 */
export default function Loading() {
  return <LoadingSkeleton variant="rectangular" height={280} />;
}
