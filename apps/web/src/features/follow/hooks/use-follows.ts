'use client';

import { useCurrentUser } from '@/features/identity';
import { useFollowControllerFindAll } from '@/lib/api';
import { followListKey, followListParams } from './follow-query-keys';
import type { Follow } from '../types';

/**
 * The caller's followed entities.
 *
 * This is what the following list on the profile screen renders. It reads
 * the same request the follow button reads — one cached entry for the
 * caller's whole follow set — so the two agree without a second request
 * and an unfollow in the list is reflected on every detail view at once.
 *
 * The list is fetched with the largest page the API allows, so the whole
 * set arrives in one request and the paging happens here.
 */
export function useFollows() {
  const viewer = useCurrentUser();
  const viewerId = viewer?.id ?? null;

  const query = useFollowControllerFindAll(followListParams, {
    query: {
      // The key is scoped by the viewer and matches the key the follow
      // mutation writes to, so an unfollow in this list is reflected by
      // every detail view without a refetch.
      queryKey: viewerId ? followListKey(viewerId) : undefined,
      enabled: Boolean(viewerId),
      staleTime: 30_000,
    },
  });

  const items: Follow[] = query.data?.items ?? [];

  return {
    ...query,
    /** The followed entities. */
    items,
    /** The count of followed entities. */
    total: query.data?.meta?.total ?? items.length,
    isLoaded: query.isSuccess,
    isFetching: query.isFetching,
    isFailed: query.isError,
  };
}
