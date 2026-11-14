'use client';

import { useOutputsControllerFindAll } from '@/lib/api';
import type { OutputResponseDto } from '../types';

export function useProfileOutputs({
  userId,
  enabled = true,
}: {
  userId?: string;
  enabled?: boolean;
}) {
  const ownedQuery = useOutputsControllerFindAll(
    { userId, limit: 100 },
    {
      query: {
        enabled: enabled && Boolean(userId),
        staleTime: 60 * 1000,
      },
    },
  );

  const coAuthoredQuery = useOutputsControllerFindAll(
    { authorId: userId, limit: 100 },
    {
      query: {
        enabled: enabled && Boolean(userId),
        staleTime: 60 * 1000,
      },
    },
  );

  const ownedOutputs: OutputResponseDto[] = ownedQuery.data?.items ?? [];
  const coAuthoredOutputs: OutputResponseDto[] =
    coAuthoredQuery.data?.items ?? [];

  // Deduplicate outputs: owned outputs take precedence
  const ownedIds = new Set(ownedOutputs.map((o) => o.id));
  const distinctCoAuthored = coAuthoredOutputs.filter(
    (o) => !ownedIds.has(o.id),
  );

  const allOutputs = [...ownedOutputs, ...distinctCoAuthored];
  const isLoading =
    (ownedQuery.isPending && ownedQuery.fetchStatus !== 'idle') ||
    (coAuthoredQuery.isPending && coAuthoredQuery.fetchStatus !== 'idle');
  const isFetching = ownedQuery.isFetching || coAuthoredQuery.isFetching;
  const isFailed = ownedQuery.isError || coAuthoredQuery.isError;

  return {
    allOutputs,
    ownedOutputs,
    coAuthoredOutputs: distinctCoAuthored,
    isLoading,
    isFetching,
    isFailed,
    refetch: () => {
      ownedQuery.refetch();
      coAuthoredQuery.refetch();
    },
  };
}
