'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  followControllerCreate,
  followControllerRemove,
} from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import type { FollowTargetDto } from '@/lib/api/models';
import { followListKey } from '@/features/follow';

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
  const queryKey = followListKey(userId);

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
    onSuccess: async () => {
      // The follow feature owns the list's shape, so the cache is left to
      // it: invalidating re-reads the caller's follows from the API.
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    changeFollow: mutation.mutateAsync,
    isSaving: mutation.isPending,
    isFailed: mutation.isError,
  };
}
