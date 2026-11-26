'use client';

import {
  getOpportunitiesControllerFindOneQueryKey,
  useOpportunitiesControllerFindOne,
  useApplicationsControllerReceived,
} from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import type { Opportunity } from '../types';

/**
 * One opportunity, as the detail screen reads it.
 *
 * The read is the opportunity itself; the applications it received are a
 * separate query, because only a manager may see them and the screen
 * only asks for them when that is true.
 */
export function useOpportunity({
  opportunityId,
  viewerId,
  enabled = true,
}: {
  opportunityId?: string;
  viewerId?: string;
  enabled?: boolean;
}) {
  const query = useOpportunitiesControllerFindOne(opportunityId ?? '', {
    query: {
      queryKey: [
        ...getOpportunitiesControllerFindOneQueryKey(opportunityId ?? ''),
        viewerId ?? null,
      ],
      enabled: Boolean(opportunityId && enabled),
      staleTime: 60 * 1000,
    },
  });

  const opportunity: Opportunity | undefined = query.data;
  const statusCode = query.error ? apiStatusCode(query.error) : null;

  /**
   * The request succeeded but carried no opportunity.
   *
   * A failure is never rendered as "not found": a transient API error
   * must not read as a fact about the opportunity.
   */
  const isEmpty = !query.isError && !query.isPending && !opportunity;

  return {
    opportunity,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    isFetching: query.isFetching,
    isFailed: query.isError,
    isForbidden: statusCode === 403,
    isNotFound: statusCode === 404,
    isEmpty,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * The applications one opportunity received.
 *
 * Only a manager of the opportunity may read them, so the query stays off
 * for everybody else.
 */
export function useOpportunityApplications({
  opportunityId,
  enabled,
}: {
  opportunityId?: string;
  enabled: boolean;
}) {
  const query = useApplicationsControllerReceived(
    opportunityId ?? '',
    { page: 1, limit: 50 },
    {
      query: {
        enabled: Boolean(opportunityId && enabled),
      },
    },
  );

  return {
    ...query,
    /** The applications. */
    applications: query.data?.items ?? [],
    isLoading: query.isPending,
    isFailed: query.isError,
  };
}
