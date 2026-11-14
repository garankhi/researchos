'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getApplicationsControllerMineQueryKey,
  useApplicationsControllerMine,
  useApplicationsControllerWithdraw,
} from '@/lib/api';
import type { ApplicationResponseDto } from '../types';

export function useMyApplications({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();

  const query = useApplicationsControllerMine(
    { page: 1, limit: 50 },
    {
      query: {
        enabled,
        staleTime: 30 * 1000,
      },
    },
  );

  const withdrawMutation = useApplicationsControllerWithdraw({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: getApplicationsControllerMineQueryKey({
            page: 1,
            limit: 50,
          }),
        });
      },
    },
  });

  const applications: ApplicationResponseDto[] = query.data?.items ?? [];
  const isLoading = query.isPending && query.fetchStatus !== 'idle';
  const isFetching = query.isFetching;
  const isFailed = query.isError;

  return {
    applications,
    total: query.data?.meta?.total ?? 0,
    isLoading,
    isFetching,
    isFailed,
    error: query.error,
    refetch: query.refetch,
    withdraw: (applicationId: string) =>
      withdrawMutation.mutateAsync({ applicationId }),
    isWithdrawing: withdrawMutation.isPending,
  };
}
