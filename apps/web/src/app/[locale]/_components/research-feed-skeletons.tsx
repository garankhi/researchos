import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * The layout of one research card in the feed.
 *
 * It mirrors the card the feed renders: a title, a row of badges, a
 * metadata line, an author line and a row of actions.
 */
const researchCard: SkeletonResult = {
  name: 'home-research-card',
  viewportWidth: 768,
  width: 720,
  height: 148,
  bones: [
    [0, 0, 62, 22, 0],
    [0, 34, 78, 16, 0],
    [0, 60, 30, 16, 0],
    [0, 86, 88, 14, 0],
    [0, 114, 22, 20, 0],
    [26, 114, 22, 20, 0],
    [52, 114, 22, 20, 0],
  ],
};

/**
 * The layout of the feed while it loads.
 *
 * The feed is a stack of cards, so the fallback reserves two of them and
 * the space is already taken when the cards arrive.
 */
const researchFeed: SkeletonResult = {
  name: 'home-research-feed',
  viewportWidth: 768,
  width: 720,
  height: 312,
  bones: [
    [0, 0, 100, 148, 0],
    [0, 164, 100, 148, 0],
  ],
};

/** The skeleton shown while the research feed is loading. */
export function ResearchFeedSkeleton() {
  return <DelayedSkeleton layout={researchFeed} />;
}

/** The skeleton shown while a single research card is loading. */
export function ResearchCardSkeleton() {
  return <DelayedSkeleton layout={researchCard} />;
}
