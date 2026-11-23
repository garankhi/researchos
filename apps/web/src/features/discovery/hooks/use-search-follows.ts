'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { followControllerCreate, followControllerRemove } from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import type { FollowTargetDto } from '@/lib/api/models';
import { applyFollowToCache } from '@/features/follow';

/**
 * Changes one follow on behalf of the search results.
 *
 * The state itself is read through the `follow` feature, which owns the
 * single cached follow list every surface shares. This hook only performs
 * the write, so the search results, the follow button and the following
 * list can never disagree.
 */
export function useChangeSearchFollow(userId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      target,
      follow,
    }: {
      target: FollowTargetDto;
      follow: boolean;
    }) => {
      if (!follow) {
        await followControllerRemove(target.entityType, target.entityId);
        return;
      }
      try {
        await followControllerCreate({
          entityType: target.entityType,
          entityId: target.entityId,
        });
      } catch (error) {
        // A follow created in another tab already satisfies this action.
        if (apiStatusCode(error) !== 409) throw error;
      }
    },
    onSuccess: async (_, { target, follow }) => {
      // The cached list is the shared source of truth, so the change is
      // written to it directly: every surface reading it re-renders at
      // once, without waiting for a refetch.
      applyFollowToCache(queryClient, userId, target, follow);
    },
  });

  return {
    changeFollow: mutation.mutateAsync,
    isSaving: mutation.isPending,
    isFailed: mutation.isError,
  };
}
