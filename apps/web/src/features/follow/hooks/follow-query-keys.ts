/**
 * The query keys of the follow feature.
 *
 * Every follow read and write shares one cache, so a follow toggled on a
 * detail view is reflected in the following list on the profile screen
 * without a page reload.
 *
 * The key is built from the **Orval** key of the list endpoint
 * (`['/follows', params]`), so the feature's hooks and the generated
 * client read and write one cache entry rather than two that drift apart.
 */

import type { FollowControllerFindAllParams } from '@/lib/api/models';
import { MAX_PAGE_SIZE } from '@/utils/pagination';

/**
 * The params of the follow list request the feature uses.
 *
 * The list is fetched with the largest page the API allows, so one request
 * carries the caller's whole follow set and a detail view can read the
 * state of its entity without asking for it.
 */
export const followListParams: FollowControllerFindAllParams = {
  page: 1,
  limit: MAX_PAGE_SIZE,
};

/**
 * The key of the caller's list of followed entities.
 *
 * The list endpoint answers with the *caller's* follows, so the key is
 * scoped by the signed-in researcher — one researcher's list must never be
 * served to another from the same cache.
 *
 * The hook that reads the list passes this key to the generated client, so
 * the read and the write land on the same cache entry.
 *
 * @param viewerId The signed-in researcher's id.
 */
export function followListKey(viewerId: string) {
  return ['/follows', followListParams, viewerId] as const;
}
