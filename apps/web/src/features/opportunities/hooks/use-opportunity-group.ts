'use client';

import { useGroupsControllerFindOne } from '@/lib/api';

/**
 * The name of the group an opportunity belongs to.
 *
 * The opportunity carries the group's id but not its name, and the banner
 * shows the name, so the group is read once and cached.
 */
export function useOpportunityGroup(groupId?: string | null) {
  const query = useGroupsControllerFindOne(groupId ?? '', {
    query: {
      enabled: Boolean(groupId),
      staleTime: 5 * 60 * 1000,
    },
  });

  return {
    /** The group's name, when it is known. */
    groupName: query.data?.name,
    /** Whether the group is still loading. */
    isLoading: query.isPending,
  };
}
