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
    /** The group leader, who may also change the visibility of the group's works. */
    groupLeadId: query.data?.leadId ?? null,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    isFailed: query.isError,
    refetch: query.refetch,
  };
}
