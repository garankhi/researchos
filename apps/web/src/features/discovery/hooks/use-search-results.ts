'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  getAuthControllerMeQueryKey,
  getDiscoveryControllerCountsQueryKey,
  getDiscoveryControllerSearchQueryKey,
  useDiscoveryControllerCounts,
  useDiscoveryControllerSearch,
} from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import type { DiscoveryControllerSearchParams } from '@/lib/api/models';

function retrySearch(failureCount: number, error: unknown) {
  return apiStatusCode(error) !== 401 && failureCount < 3;
}

function useRecheckSessionOnUnauthorized(error: unknown) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (apiStatusCode(error) !== 401) return;

    // Let the session query decide whether to show the sign-in boundary.
    void queryClient.invalidateQueries(
      { queryKey: getAuthControllerMeQueryKey(), exact: true },
      { cancelRefetch: false },
    );
  }, [error, queryClient]);
}

// The API filters results by caller. Separate cached results for each account.
export function useSearchCounts(
  userId: string,
  term: string,
  enabled: boolean,
) {
  const params = { q: term };
  const query = useDiscoveryControllerCounts(params, {
    query: {
      queryKey: [...getDiscoveryControllerCountsQueryKey(params), userId],
      enabled,
      retry: retrySearch,
    },
  });
  useRecheckSessionOnUnauthorized(
    enabled && query.isFetchedAfterMount ? query.error : null,
  );
  return {
    counts: query.data,
    isFailed: enabled && query.isError && !query.data,
    retry: query.refetch,
  };
}

export function useSearchResults(
  userId: string,
  params: DiscoveryControllerSearchParams,
  enabled: boolean,
  goToPage: (page: number) => void,
) {
  const queryClient = useQueryClient();
  const query = useDiscoveryControllerSearch(params, {
    query: {
      queryKey: [...getDiscoveryControllerSearchQueryKey(params), userId],
      enabled,
      retry: retrySearch,
    },
  });
  useRecheckSessionOnUnauthorized(
    enabled && query.isFetchedAfterMount ? query.error : null,
  );

  const meta = query.data?.meta;
  const recoveryPage =
    enabled && meta && meta.total > 0 && meta.page > meta.totalPages
      ? meta.totalPages
      : undefined;

  useEffect(() => {
    if (recoveryPage === undefined) return;
    const pageParams = { ...params, page: recoveryPage };
    // The cached page may still report that the removed page exists.
    queryClient.removeQueries({
      queryKey: [...getDiscoveryControllerSearchQueryKey(pageParams), userId],
      exact: true,
    });
    goToPage(recoveryPage);
  }, [goToPage, params, queryClient, recoveryPage, userId]);

  const isRecoveringPage = recoveryPage !== undefined;
  return {
    items: query.data?.items ?? [],
    pageInfo: isRecoveringPage ? undefined : meta,
    isLoadingPage: enabled && (query.isLoading || isRecoveringPage),
    isEmpty: meta?.total === 0,
    isFailed: enabled && query.isError && !query.data,
    retry: query.refetch,
  };
}
