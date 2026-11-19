'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/features/identity';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import {
  groupsControllerFindOne,
  groupMembersControllerFindAll,
  groupDirectionsControllerList,
  groupOutputLinksControllerList,
  opportunitiesControllerFindAll,
  applicationsControllerForGroup,
} from '@/lib/api';
import { groupPermissions } from '../types';

export function useHubCollection<T>(
  key: readonly unknown[],
  enabled: boolean,
  read: (
    page: number,
    signal: AbortSignal,
  ) => Promise<{ items: T[]; meta: { hasNextPage: boolean; page: number } }>,
) {
  const query = useInfiniteQuery({
    queryKey: key,
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => read(pageParam, signal),
    getNextPageParam: (page) =>
      page.meta.hasNextPage ? page.meta.page + 1 : undefined,
  });
  return { ...query, data: query.data?.pages.flatMap((page) => page.items) };
}

export function useGroupHub(groupId: string) {
  const user = useCurrentUser();
  const key = ['group-hub', user?.id, groupId];
  const group = useQuery({
    queryKey: [...key, 'info'],
    queryFn: ({ signal }) =>
      groupsControllerFindOne(groupId, undefined, signal),
    enabled: Boolean(groupId && user),
  });
  const enabled = Boolean(group.data && user);
  const members = useHubCollection(
    [...key, 'members'],
    enabled,
    (page, signal) =>
      groupMembersControllerFindAll(
        groupId,
        { page, limit: 20 },
        undefined,
        signal,
      ),
  );
  const permissions =
    group.data && user
      ? groupPermissions(group.data, user, members.data ?? [])
      : null;
  const directions = useHubCollection(
    [...key, 'directions'],
    enabled,
    (page, signal) =>
      groupDirectionsControllerList(
        groupId,
        { page, limit: 20 },
        undefined,
        signal,
      ),
  );
  const outputs = useHubCollection(
    [...key, 'outputs', 'ACCEPTED'],
    enabled,
    (page, signal) =>
      groupOutputLinksControllerList(
        groupId,
        { page, limit: 20, status: 'ACCEPTED' },
        undefined,
        signal,
      ),
  );
  const pendingOutputs = useHubCollection(
    [...key, 'outputs', 'PENDING'],
    enabled && Boolean(permissions?.manageOutputs),
    (page, signal) =>
      groupOutputLinksControllerList(
        groupId,
        { page, limit: 20, status: 'PENDING' },
        undefined,
        signal,
      ),
  );
  const manageOpportunities = Boolean(permissions?.manageOpportunities);
  const opportunities = useHubCollection(
    [...key, 'opportunities', manageOpportunities],
    enabled,
    (page, signal) =>
      opportunitiesControllerFindAll(
        {
          groupId,
          page,
          limit: 20,
          ...(!manageOpportunities ? { status: 'OPEN' as const } : {}),
        },
        undefined,
        signal,
      ),
  );
  const applications = useHubCollection(
    [...key, 'applications'],
    enabled && manageOpportunities,
    (page, signal) =>
      applicationsControllerForGroup(
        groupId,
        { page, limit: 20 },
        undefined,
        signal,
      ),
  );
  return {
    group,
    members,
    directions,
    outputs,
    pendingOutputs,
    opportunities,
    applications,
    permissions,
  };
}

export function useHubMutation<T>(
  groupId: string,
  mutationFn: (values: T) => Promise<unknown>,
) {
  const client = useQueryClient();
  const { showSnackbar } = useSnackbar();
  const t = useTranslations('groups');
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'group-hub' && query.queryKey[2] === groupId,
        }),
        client.invalidateQueries({
          predicate: (query) => {
            const url = query.queryKey[0];
            return (
              typeof url === 'string' &&
              (url.startsWith('/research-groups') ||
                url === '/opportunities' ||
                url === '/my/applications')
            );
          },
        }),
      ]);
      showSnackbar({ message: t('saved'), severity: 'success' });
    },
  });
}
