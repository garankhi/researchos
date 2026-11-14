'use client';

import { useGroupsControllerFindAll } from '@/lib/api';
import type { ResearchGroupResponseDto } from '../types';

export function useProfileGroups({
  userId,
  enabled = true,
}: {
  userId?: string;
  enabled?: boolean;
}) {
  const ledQuery = useGroupsControllerFindAll(
    { leadId: userId, limit: 100 },
    {
      query: {
        enabled: enabled && Boolean(userId),
        staleTime: 60 * 1000,
      },
    },
  );

  const memberQuery = useGroupsControllerFindAll(
    { memberId: userId, limit: 100 },
    {
      query: {
        enabled: enabled && Boolean(userId),
        staleTime: 60 * 1000,
      },
    },
  );

  const groupsLed: ResearchGroupResponseDto[] = ledQuery.data?.items ?? [];
  const groupsMember: ResearchGroupResponseDto[] =
    memberQuery.data?.items ?? [];

  // Exclude led groups from member list to avoid showing duplicates
  const ledIds = new Set(groupsLed.map((g) => g.id));
  const memberOnlyGroups = groupsMember.filter((g) => !ledIds.has(g.id));

  const allGroups = [...groupsLed, ...memberOnlyGroups];
  const isLoading =
    (ledQuery.isPending && ledQuery.fetchStatus !== 'idle') ||
    (memberQuery.isPending && memberQuery.fetchStatus !== 'idle');
  const isFetching = ledQuery.isFetching || memberQuery.isFetching;
  const isFailed = ledQuery.isError || memberQuery.isError;

  return {
    allGroups,
    groupsLed,
    memberOnlyGroups,
    isLoading,
    isFetching,
    isFailed,
    refetch: () => {
      ledQuery.refetch();
      memberQuery.refetch();
    },
  };
}
