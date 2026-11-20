'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/features/identity';
import {
  followControllerCreate,
  followControllerRemove,
  useFollowControllerFindAll,
} from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import { followListKey, followListParams } from './follow-query-keys';
import type { FollowableEntityType } from '../types';

/**
 * The follow state of one entity, and the action that changes it.
 *
 * A detail view calls this with the entity it is showing. The hook reads
 * whether the caller already follows it, and exposes a `toggle` that
 * creates or removes the follow.
 *
 * The read is **not** a separate request per entity: the caller's whole
 * follow list is fetched once and cached, and the state of the entity is
 * read from that list. Every detail view therefore shares one request, and
 * a follow toggled on one screen is reflected on the next.
 */
export function useFollow({
  entityType,
  entityId,
  enabled = true,
}: {
  entityType: FollowableEntityType;
  entityId?: string;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const viewer = useCurrentUser();
  const viewerId = viewer?.id ?? null;

  /**
   * Only a researcher can follow, and only someone else: the backend
   * rejects a self-follow with `follow_self`. A viewer without the
   * `RESEARCHER` role never sees the button, so the query stays off.
   */
  const canFollow = Boolean(
    viewerId && viewer?.roles?.includes('RESEARCHER') && enabled,
  );

  const listKey = viewerId ? followListKey(viewerId) : null;

  const listQuery = useFollowControllerFindAll(followListParams, {
    query: {
      // The key is scoped by the viewer, so one researcher's follows are
      // never served to another from the same cache. It matches the key the
      // mutation writes to, so a change lands on the entry that is read.
      queryKey: listKey ?? undefined,
      enabled: Boolean(canFollow && viewerId),
      staleTime: 30_000,
    },
  });

  const isFollowing = Boolean(
    entityId &&
      listQuery.data?.items?.some(
        (item) =>
          item.entityType === entityType && item.entityId === entityId,
      ),
  );

  const createMutation = useMutation({
    mutationFn: (target: {
      entityType: FollowableEntityType;
      entityId: string;
    }) => followControllerCreate(target),
  });

  const removeMutation = useMutation({
    mutationFn: (target: {
      entityType: FollowableEntityType;
      entityId: string;
    }) => followControllerRemove(target.entityType, target.entityId),
  });

  /**
   * Applies a follow change to the cached list, so the button flips without
   * waiting for a refetch.
   *
   * The list is the single source of truth for the state, so the update
   * writes to it and every screen reading it re-renders.
   */
  const applyToCache = (
    target: { entityType: FollowableEntityType; entityId: string },
    following: boolean,
  ) => {
    if (!viewerId || !listKey) return;

    queryClient.setQueryData<typeof listQuery.data>(
      listKey,
      (current) => {
        if (!current) return current;

        if (!following) {
          return {
            ...current,
            items: current.items.filter(
              (item) =>
                !(
                  item.entityType === target.entityType &&
                  item.entityId === target.entityId
                ),
            ),
            meta: {
              ...current.meta,
              total: Math.max(0, current.meta.total - 1),
            },
          };
        }

        // The follow was just created, so the list has no entry for it yet.
        // A placeholder keeps the button's state correct until the next
        // refetch replaces it with the server's own row.
        const alreadyListed = current.items.some(
          (item) =>
            item.entityType === target.entityType &&
            item.entityId === target.entityId,
        );
        if (alreadyListed) return current;

        return {
          ...current,
          items: [
            ...current.items,
            {
              entityType: target.entityType,
              entityId: target.entityId,
              followedAt: new Date().toISOString(),
              displayName: '',
              state: '',
            },
          ],
          meta: { ...current.meta, total: current.meta.total + 1 },
        };
      },
    );
  };

  const mutation = isFollowing ? removeMutation : createMutation;

  /**
   * Removes the follow, whatever the cached state says.
   *
   * A surface that only ever *removes* a follow — the row of the following
   * list — calls this instead of `toggle`, so a stale cache cannot turn an
   * unfollow into a follow.
   */
  const unfollow = async () => {
    if (!entityId) return;

    const target = { entityType, entityId };

    await removeMutation.mutateAsync(target);
    applyToCache(target, false);
  };

  const toggle = async () => {
    if (!entityId) return;

    const target = { entityType, entityId };

    if (isFollowing) {
      await removeMutation.mutateAsync(target);
      applyToCache(target, false);
    } else {
      try {
        await createMutation.mutateAsync(target);
      } catch (error) {
        // A duplicate follow is a conflict, not a failure: the caller
        // already follows the target, so the desired state is reached.
        if (apiStatusCode(error) !== 409) throw error;
      }
      applyToCache(target, true);
    }
  };

  return {
    /** Whether the caller follows the entity right now. */
    isFollowing,
    /** Whether the follow state is known yet. */
    isReady: Boolean(listQuery.data),
    /** Whether the caller may follow at all. */
    canFollow: canFollow && Boolean(entityId),
    /** Whether the toggle is in flight. */
    isToggling: mutation.isPending,
    /** Whether a removal is in flight. */
    isRemoving: removeMutation.isPending,
    /** Flips the follow state. */
    toggle,
    /** Removes the follow. */
    unfollow,
    /** The last error of the toggle, if any. */
    error: mutation.error,
    /** Refetches the caller's follow list. */
    refetch: listQuery.refetch,
  };
}
