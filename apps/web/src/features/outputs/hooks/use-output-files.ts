'use client';

import { useOutputsControllerFindFiles } from '@/lib/api';
import { mapOutputFile, type OutputFile } from '../types';

export function useOutputFiles({ outputId }: { outputId?: string }) {
  const query = useOutputsControllerFindFiles(outputId ?? '', {
    query: {
      enabled: Boolean(outputId),
      staleTime: 60 * 1000,
    },
  });

  const files: OutputFile[] | undefined = query.data?.map(mapOutputFile);

  const isLoading = query.isPending && query.fetchStatus !== 'idle';

  return {
    files,
    isLoading,
    isFetching: query.isFetching,
    isFailed: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
