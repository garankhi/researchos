'use client';

import { useOutputsControllerFindRevisionHistory } from '@/lib/api';
import {
  mapOutputRevisionHistory,
  type OutputRevisionHistoryEntry,
} from '../types';

/**
 * The edit history of a work.
 *
 * The endpoint answers only for a work the caller may see, so the request
 * is made for every work and the server decides. The entries come back
 * newest first, each naming the accounts that wrote and released it.
 */
export function useOutputRevisionHistory({ outputId }: { outputId?: string }) {
  const query = useOutputsControllerFindRevisionHistory(outputId ?? '', {
    query: {
      enabled: Boolean(outputId),
      staleTime: 60 * 1000,
    },
  });

  const entries: OutputRevisionHistoryEntry[] | undefined = query.data?.map(
    mapOutputRevisionHistory,
  );

  const isLoading = query.isPending && query.fetchStatus !== 'idle';

  return {
    entries,
    isLoading,
    isFetching: query.isFetching,
    isFailed: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
