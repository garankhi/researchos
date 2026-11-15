import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * The layout of the health line.
 *
 * The loaded state is a single line of text, so the fallback reserves one.
 */
const apiStatus: SkeletonResult = {
  name: 'app-api-status',
  viewportWidth: 768,
  width: 220,
  height: 20,
  bones: [[0, 0, 100, 20, 0]],
};

/** The skeleton shown while the API health check is in flight. */
export function ApiStatusSkeleton() {
  return <DelayedSkeleton layout={apiStatus} />;
}
