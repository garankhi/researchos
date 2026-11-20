'use client';

import { useCurrentUser } from '@/features/identity';
import { useFollowControllerFindAll } from '@/lib/api';
import { followListKey, followListParams } from './follow-query-keys';

/**
 * The identity of a followed entity, as a single comparable key.
 *
 * A surface that shows many entities at once — the search results, the
 * following list — needs to ask "do I follow this one?" for each row. A
 * key makes that a set lookup instead of a scan.
 */
export function followKey(
  target: { entityType: string; entityId: string },
): string;
export function followKey(entityType: string, entityId: string): string;
export function followKey(
  targetOrType: { entityType: string; entityId: string } | string,
  entityId?: string,
): string {
  if (typeof targetOrType === 'string') {
    return `${targetOrType}:${entityId ?? ''}`;
  }
  return `${targetOrType.entityType}:${targetOrType.entityId}`;
}

/**
 * The caller's followed entities, as a set of keys.
 *
 * This is the shared read of the follow state. Every surface that needs to
 * know what the caller follows — the follow button, the following list,
 * the search results — reads this one cached request, so the three agree
 * and a change in one is visible in the others.
 */
export function useFollowKeys() {
  const viewer = useCurrentUser();
  const viewerId = viewer?.id ?? null;

  const query = useFollowControllerFindAll(followListParams, {
    query: {
      // The key is scoped by the viewer and matches the key the follow
      // mutation writes to, so the search results and the detail views
      // always read the same state.
      queryKey: viewerId ? followListKey(viewerId) : undefined,
      enabled: Boolean(viewerId),
      staleTime: 30_000,
    },
  });

  const keys = new Set(
    query.data?.items?.map((item) =>
      followKey(item.entityType, item.entityId),
    ) ?? [],
  );

  return {
    /** The keys of the entities the caller follows. */
    keys,
    /** Whether the follow state is known yet. */
    isReady: Boolean(query.data),
    /** Whether the caller may follow at all. */
    canFollow: Boolean(viewer?.roles?.includes('RESEARCHER')),
    /** The failed request, if any. */
    error: query.error,
    /** Refetches the caller's follow list. */
    refetch: query.refetch,
  };
}
