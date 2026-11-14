'use client';

import { useGroupsControllerFindOne } from '@/lib/api';

export function useOutputGroup({ groupId }: { groupId?: string | null }) {
  const query = useGroupsControllerFindOne(groupId ?? '', {
    query: {
      enabled: Boolean(groupId),
      staleTime: 60 * 1000,
    },
  });

  return {
    group: query.data,
    groupName: query.data?.name,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    isFailed: query.isError,
    refetch: query.refetch,
  };
}
