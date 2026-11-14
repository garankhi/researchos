'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getOpenAlexCandidatesControllerCountQueryKey,
  getOpenAlexCandidatesControllerFindAllQueryKey,
  useOpenAlexCandidatesControllerAccept,
  useOpenAlexCandidatesControllerCount,
  useOpenAlexCandidatesControllerFindAll,
  useOpenAlexCandidatesControllerReject,
} from '@/lib/api';
import type { CandidateWorkDto } from '../types';

export function useOpenAlexCandidates({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();

  const listQuery = useOpenAlexCandidatesControllerFindAll(
    { page: 1, limit: 50 },
    {
      query: {
        enabled,
        staleTime: 30 * 1000,
      },
    },
  );

  const countQuery = useOpenAlexCandidatesControllerCount({
    query: {
      enabled,
      staleTime: 30 * 1000,
    },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getOpenAlexCandidatesControllerFindAllQueryKey({
          page: 1,
          limit: 50,
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: getOpenAlexCandidatesControllerCountQueryKey(),
      }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          query.queryKey[0].startsWith('/outputs'),
      }),
    ]);
  };

  const acceptMutation = useOpenAlexCandidatesControllerAccept({
    mutation: {
      onSuccess: invalidate,
    },
  });

  const rejectMutation = useOpenAlexCandidatesControllerReject({
    mutation: {
      onSuccess: invalidate,
    },
  });

  const candidates: CandidateWorkDto[] = listQuery.data?.items ?? [];
  const count = countQuery.data?.count ?? 0;
  const isLoading = listQuery.isPending && listQuery.fetchStatus !== 'idle';
  const isFetching = listQuery.isFetching;
  const isFailed = listQuery.isError;

  return {
    candidates,
    pendingCount: count,
    isLoading,
    isFetching,
    isFailed,
    refetch: () => {
      listQuery.refetch();
      countQuery.refetch();
    },
    acceptWork: (outputId: string) => acceptMutation.mutateAsync({ outputId }),
    isAccepting: acceptMutation.isPending,
    rejectWork: (outputId: string) => rejectMutation.mutateAsync({ outputId }),
    isRejecting: rejectMutation.isPending,
  };
}
