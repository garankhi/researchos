import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * The layout of the publication detail page while it loads.
 *
 * It mirrors the page the detail route renders: a header with a title, a
 * metadata line and a row of actions, above an abstract panel with a
 * heading and three lines of text.
 */
const detail: SkeletonResult = {
  name: 'output-detail',
  viewportWidth: 768,
  width: 720,
  height: 212,
  bones: [
    [0, 0, 72, 26, 0],
    [0, 38, 46, 16, 0],
    [0, 70, 18, 20, 0],
    [22, 70, 18, 20, 0],
    [44, 70, 18, 20, 0],
    [0, 104, 26, 18, 0],
    [0, 136, 100, 14, 0],
    [0, 158, 96, 14, 0],
    [0, 180, 72, 14, 0],
  ],
};

/** The skeleton shown while the publication detail page is loading. */
export function OutputDetailSkeleton() {
  return <DelayedSkeleton layout={detail} />;
}
