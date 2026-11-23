/**
 * Follow feature — public entry point.
 *
 * This barrel is the only import surface other modules should use. Import
 * from `@/features/follow` rather than reaching into the subfolders, so the
 * internal layout can change without rippling through the app.
 */

export { FollowButton } from './components/follow-button';
export { FollowList } from './components/follow-list';
export { FollowListRow } from './components/follow-list-row';
export { useFollow } from './hooks/use-follow';
export { useFollowKeys, followKey } from './hooks/use-follow-keys';
export { useFollows } from './hooks/use-follows';
export { applyFollowToCache } from './hooks/follow-cache';
export { followListKey } from './hooks/follow-query-keys';
export type {
  Follow,
  FollowableEntityType,
  FollowEntityType,
  FollowPage,
  FollowTarget,
} from './types';
