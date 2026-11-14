'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getInterestsControllerListQueryKey,
  getProfilesControllerGetInterestsByUserIdQueryKey,
  useInterestsControllerCreate,
  useInterestsControllerRemove,
  useInterestsControllerUpdate,
  useProfilesControllerGetInterestsByUserId,
} from '@/lib/api';
import type { ProfileInterestResponseDto } from '../types';

export function useProfileInterests({
  userId,
  enabled = true,
}: {
  userId?: string;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();

  const query = useProfilesControllerGetInterestsByUserId(userId ?? '', {
    query: {
      enabled: enabled && Boolean(userId),
      staleTime: 60 * 1000,
    },
  });

  const invalidate = async () => {
    await Promise.all([
      userId
        ? queryClient.invalidateQueries({
            queryKey: getProfilesControllerGetInterestsByUserIdQueryKey(userId),
          })
        : Promise.resolve(),
      queryClient.invalidateQueries({
        queryKey: getInterestsControllerListQueryKey(),
      }),
    ]);
  };

  const createMutation = useInterestsControllerCreate({
    mutation: {
      onSuccess: invalidate,
    },
  });

  const updateMutation = useInterestsControllerUpdate({
    mutation: {
      onSuccess: invalidate,
    },
  });

  const removeMutation = useInterestsControllerRemove({
    mutation: {
      onSuccess: invalidate,
    },
  });

  const interests: ProfileInterestResponseDto[] = query.data ?? [];
  const isLoading = query.isPending && query.fetchStatus !== 'idle';
  const isFetching = query.isFetching;
  const isFailed = query.isError;

  return {
    interests,
    isLoading,
    isFetching,
    isFailed,
    error: query.error,
    refetch: query.refetch,
    createInterest: (topicId: string) =>
      createMutation.mutateAsync({ data: { topicId } }),
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    updateStatus: (id: string, status: 'ACTIVE' | 'REJECTED') =>
      updateMutation.mutateAsync({ id, data: { status } }),
    isUpdating: updateMutation.isPending,
    removeInterest: (id: string) => removeMutation.mutateAsync({ id }),
    isRemoving: removeMutation.isPending,
  };
}
