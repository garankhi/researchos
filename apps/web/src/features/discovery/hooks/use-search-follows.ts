'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  followControllerCreate,
  followControllerFindAll,
  followControllerRemove,
} from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import type { FollowTargetDto } from '@/lib/api/models';
import { MAX_PAGE_SIZE } from '@/utils/pagination';

export function followKey(target: FollowTargetDto) {
  return `${target.entityType}:${target.entityId}`;
}

export function useSearchFollows(userId: string, enabled: boolean) {
  const queryKey = ['search-follows', userId];

  const query = useQuery({
    queryKey,
    enabled,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const targets: string[] = [];
      let page = 1;

      for (;;) {
        const response = await followControllerFindAll(
          { page, limit: MAX_PAGE_SIZE },
          undefined,
          signal,
        );
        targets.push(...response.items.map(followKey));
        if (!response.meta.hasNextPage) return targets;
        page += 1;
      }
    },
  });

  return {
    targets: query.data,
    isFailed: enabled && query.isError && !query.data,
    retry: query.refetch,
  };
}

export function useChangeSearchFollow(userId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['search-follows', userId];

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
      await queryClient.cancelQueries({ queryKey });
      const key = followKey(target);
      queryClient.setQueryData<string[]>(queryKey, (current) => {
        const remainder = (current ?? []).filter((item) => item !== key);
        return follow ? [...remainder, key] : remainder;
      });
    },
  });

  return {
    changeFollow: mutation.mutateAsync,
    isSaving: mutation.isPending,
    isFailed: mutation.isError,
  };
}
