'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chatControllerCreateConversation,
  followControllerCreate,
  followControllerFindAll,
  followControllerRemove,
  useAuthControllerMe,
} from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import { MAX_PAGE_SIZE } from '@/utils/pagination';

function researcherFollowKey(userId: string): string {
  return `RESEARCHER:${userId}`;
}

export function useProfileSocial({
  targetUserId,
  isOwner = false,
}: {
  targetUserId?: string;
  isOwner?: boolean;
}) {
  const queryClient = useQueryClient();

  const meQuery = useAuthControllerMe({
    query: { retry: false, staleTime: 60_000 },
  });

  const viewer = meQuery.data;
  const viewerId = viewer?.id ?? null;
  const canFollow = Boolean(viewer?.roles?.includes('RESEARCHER'));
  const canInteract = Boolean(
    !isOwner && viewerId && targetUserId && viewerId !== targetUserId,
  );

  const followQueryKey = ['search-follows', viewerId ?? 'anonymous'];

  const followsQuery = useQuery({
    queryKey: followQueryKey,
    enabled: Boolean(canInteract && canFollow && viewerId),
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const targets: string[] = [];
      let page = 1;

      for (;;) {
        const response = await followControllerFindAll(
          { page, limit: MAX_PAGE_SIZE },
          undefined,
          signal,
        );
        targets.push(
          ...response.items.map(
            (item) => `${item.entityType}:${item.entityId}`,
          ),
        );
        if (!response.meta.hasNextPage) return targets;
        page += 1;
      }
    },
  });

  const isFollowing = Boolean(
    targetUserId &&
    followsQuery.data?.includes(researcherFollowKey(targetUserId)),
  );

  const followMutation = useMutation({
    mutationFn: async (nextFollow: boolean) => {
      if (!targetUserId) return nextFollow;
      if (!nextFollow) {
        await followControllerRemove('RESEARCHER', targetUserId);
        return false;
      }
      try {
        await followControllerCreate({
          entityType: 'RESEARCHER',
          entityId: targetUserId,
        });
      } catch (error) {
        if (apiStatusCode(error) !== 409) throw error;
      }
      return true;
    },
    onSuccess: async (followed) => {
      if (!targetUserId) return;
      await queryClient.cancelQueries({ queryKey: followQueryKey });
      const key = researcherFollowKey(targetUserId);
      queryClient.setQueryData<string[]>(followQueryKey, (current) => {
        const rest = (current ?? []).filter((entry) => entry !== key);
        return followed ? [...rest, key] : rest;
      });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async () => {
      if (!targetUserId) {
        throw new Error('Missing target researcher ID');
      }
      const conversation = await chatControllerCreateConversation({
        type: 'DIRECT',
        participantIds: [targetUserId],
      });
      return conversation.id;
    },
  });

  return {
    viewerId,
    canInteract,
    canFollow,
    followReady: Boolean(followsQuery.data),
    isFollowing,
    isTogglingFollow: followMutation.isPending,
    followFailed: followMutation.isError,
    toggleFollow: () => followMutation.mutateAsync(!isFollowing),
    startDirectChat: () => chatMutation.mutateAsync(),
    isStartingChat: chatMutation.isPending,
    chatFailed: chatMutation.isError,
  };
}
