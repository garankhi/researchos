'use client';

import { useQueryClient } from '@tanstack/react-query';
import { followListKey } from './follow-query-keys';

/**
 * The shape of the cached follow list.
 *
 * The list endpoint answers with a page of the caller's follows. Only the
 * parts the app reads are named here.
 */
export type FollowListCache = {
  items?: {
    entityType: string;
    entityId: string;
    followedAt?: string;
    displayName?: string;
    state?: string;
  }[];
  meta?: {
    total?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Applies a follow change to the cached list.
 *
 * The cached list is the single source of truth for the follow state, so
 * every surface that reads it — the follow button, the following list, the
 * search results — has to see the change at once. Writing to the cache is
 * what makes that happen; a refetch alone would leave the screen showing
 * the old state until the request came back.
 *
 * @param queryClient The query client that holds the cache.
 * @param viewerId The signed-in researcher's id.
 * @param target The entity whose follow changed.
 * @param following Whether the caller follows the entity after the change.
 */
export function applyFollowToCache(
  queryClient: ReturnType<typeof useQueryClient>,
  viewerId: string,
  target: { entityType: string; entityId: string },
  following: boolean,
) {
  const key = followListKey(viewerId);

  queryClient.setQueryData<FollowListCache>(key, (current) => {
    if (!current) return current;

    const items = current.items ?? [];

    if (!following) {
      return {
        ...current,
        items: items.filter(
          (item) =>
            !(
              item.entityType === target.entityType &&
              item.entityId === target.entityId
            ),
        ),
        meta: {
          ...current.meta,
          total: Math.max(0, (current.meta?.total ?? items.length) - 1),
        },
      };
    }

    // The follow was just created, so the list has no entry for it yet.
    // A placeholder keeps the button's state correct until the next
    // refetch replaces it with the server's own row.
    const alreadyListed = items.some(
      (item) =>
        item.entityType === target.entityType &&
        item.entityId === target.entityId,
    );
    if (alreadyListed) return current;

    return {
      ...current,
      items: [
        ...items,
        {
          entityType: target.entityType,
          entityId: target.entityId,
          followedAt: new Date().toISOString(),
          displayName: '',
          state: '',
        },
      ],
      meta: {
        ...current.meta,
        total: (current.meta?.total ?? items.length) + 1,
      },
    };
  });
}
