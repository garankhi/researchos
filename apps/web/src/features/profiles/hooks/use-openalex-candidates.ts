'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getOpenAlexControllerCountQueryKey,
  getOpenAlexControllerFindAllQueryKey,
  getOpenAlexControllerFindRejectedQueryKey,
  useOpenAlexControllerAccept,
  useOpenAlexControllerCount,
  useOpenAlexControllerFindAll,
  useOpenAlexControllerFindRejected,
  useOpenAlexControllerPullWorks,
  useOpenAlexControllerReject,
} from '@/lib/api';
import type { AcceptCandidateDto } from '@/lib/api/models/acceptCandidateDto';
import type { CandidateWorkDto } from '../types';

/** How many candidates one page holds. */
const PAGE_SIZE = 20;

/**
 * The candidate list of a researcher.
 *
 * Two lists, both paged: the pending suggestions and the rejected works.
 * A rejected work is never deleted — the researcher can accept it later
 * from the rejection list — so the two lists together are the whole
 * history of the pull.
 */
export function useOpenAlexCandidates({
  enabled = true,
  page = 1,
  rejectedPage = 1,
}: {
  enabled?: boolean;
  /** The page of the pending suggestions. */
  page?: number;
  /** The page of the rejection list. */
  rejectedPage?: number;
} = {}) {
  const queryClient = useQueryClient();

  const listQuery = useOpenAlexControllerFindAll(
    { page, limit: PAGE_SIZE },
    {
      query: {
        enabled,
        staleTime: 30 * 1000,
      },
    },
  );

  const rejectedQuery = useOpenAlexControllerFindRejected(
    { page: rejectedPage, limit: PAGE_SIZE },
    {
      query: {
        enabled,
        staleTime: 30 * 1000,
      },
    },
  );

  const countQuery = useOpenAlexControllerCount({
    query: {
      enabled,
      staleTime: 30 * 1000,
    },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getOpenAlexControllerFindAllQueryKey({
          page,
          limit: PAGE_SIZE,
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: getOpenAlexControllerFindRejectedQueryKey({
          page: rejectedPage,
          limit: PAGE_SIZE,
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: getOpenAlexControllerCountQueryKey(),
      }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          query.queryKey[0].startsWith('/outputs'),
      }),
    ]);
  };

  const acceptMutation = useOpenAlexControllerAccept({
    mutation: {
      onSuccess: invalidate,
    },
  });

  const rejectMutation = useOpenAlexControllerReject({
    mutation: {
      onSuccess: invalidate,
    },
  });

  const pullMutation = useOpenAlexControllerPullWorks({
    mutation: {
      onSuccess: invalidate,
    },
  });

  const candidates: CandidateWorkDto[] = listQuery.data?.items ?? [];
  const rejected: CandidateWorkDto[] = rejectedQuery.data?.items ?? [];
  const count = countQuery.data?.count ?? 0;
  const isLoading = listQuery.isPending && listQuery.fetchStatus !== 'idle';
  const isFetching = listQuery.isFetching || rejectedQuery.isFetching;
  const isFailed = listQuery.isError;

  return {
    candidates,
    rejected,
    pendingCount: count,
    rejectedCount: rejectedQuery.data?.meta?.total ?? 0,
    pendingTotal: listQuery.data?.meta?.total ?? 0,
    isLoading,
    isFetching,
    isFailed,
    refetch: () => {
      listQuery.refetch();
      rejectedQuery.refetch();
      countQuery.refetch();
    },
    acceptWork: (outputId: string, body?: AcceptCandidateDto) =>
      acceptMutation.mutateAsync({ outputId, data: body ?? {} }),
    isAccepting: acceptMutation.isPending,
    rejectWork: (outputId: string) => rejectMutation.mutateAsync({ outputId }),
    isRejecting: rejectMutation.isPending,
    pullWorks: (openAlexAuthorId?: string) =>
      pullMutation.mutateAsync({
        data: openAlexAuthorId ? { openAlexAuthorId } : {},
      }),
    isPulling: pullMutation.isPending,
  };
}
