'use client';

import { useOutputsControllerFindOne } from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import { mapOutputDetail, type OutputDetail } from '../types';

export function useOutput({ outputId }: { outputId?: string }) {
  const query = useOutputsControllerFindOne(outputId ?? '', {
    query: {
      enabled: Boolean(outputId),
      staleTime: 60 * 1000,
    },
  });

  const data: OutputDetail | undefined = query.data
    ? mapOutputDetail(query.data)
    : undefined;

  const isLoading = query.isPending && query.fetchStatus !== 'idle';
  const isFetching = query.isFetching;
  const isFailed = query.isError;
  const statusCode = query.error ? apiStatusCode(query.error) : null;
  const isForbidden = statusCode === 403;
  const isNotFound = statusCode === 404;

  /**
   * The request succeeded but carried no output.
   *
   * A failure is never rendered as "not found": a transient API error
   * must not read as a fact about the publication.
   */
  const isEmpty = !isFailed && !isLoading && data === undefined;

  return {
    output: data,
    isLoading,
    isFetching,
    isFailed,
    isForbidden,
    isNotFound,
    isEmpty,
    error: query.error,
    refetch: query.refetch,
  };
}
