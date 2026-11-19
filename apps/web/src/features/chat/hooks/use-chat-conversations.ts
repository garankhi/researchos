'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  getChatControllerGetConversationQueryKey,
  getChatControllerListConversationsQueryKey,
  useChatControllerCreateConversation,
  useChatControllerListConversations,
  useChatControllerSearchUsers,
  useChatControllerUpdateConversation,
} from '@/lib/api';
import type { ChatConversationResponseDto } from '@/lib/api/models';
import type { ChatConversationSummaryPayload } from '../types';

export function useChatConversations() {
  const queryClient = useQueryClient();
  const listKey = getChatControllerListConversationsQueryKey({
    includeArchived: false,
  });

  const query = useChatControllerListConversations(
    { includeArchived: false },
    {
      query: {
        staleTime: 15_000,
      },
    },
  );

  const createMutation = useChatControllerCreateConversation({
    mutation: {
      onSuccess: async (created) => {
        queryClient.setQueryData<ChatConversationResponseDto[]>(
          listKey,
          (prev) => {
            if (!prev) return [created];
            const filtered = prev.filter((item) => item.id !== created.id);
            return [created, ...filtered];
          },
        );
        await queryClient.invalidateQueries({ queryKey: listKey });
      },
    },
  });

  const updateMutation = useChatControllerUpdateConversation({
    mutation: {
      onSuccess: async (updated) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: listKey }),
          queryClient.invalidateQueries({
            queryKey: getChatControllerGetConversationQueryKey(updated.id),
          }),
        ]);
      },
    },
  });

  const upsertLiveConversation = useCallback(
    (incoming: ChatConversationSummaryPayload) => {
      const normalized = incoming as unknown as ChatConversationResponseDto;
      queryClient.setQueryData<ChatConversationResponseDto[]>(
        listKey,
        (prev) => {
          if (!prev) return [normalized];
          const filtered = prev.filter((c) => c.id !== normalized.id);
          if (normalized.archivedAt) {
            return filtered;
          }
          const next = [normalized, ...filtered];
          next.sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          return next;
        },
      );
      queryClient.setQueryData(
        getChatControllerGetConversationQueryKey(normalized.id),
        normalized,
      );
    },
    [listKey, queryClient],
  );

  return {
    conversations: query.data ?? [],
    isInitialLoading: query.isPending && query.fetchStatus !== 'idle',
    isFetching: query.isFetching,
    isFailed: query.isError,
    error: query.error,
    refetch: query.refetch,
    createConversation: createMutation,
    updateConversation: updateMutation,
    upsertLiveConversation,
  };
}

export function useSearchChatPeople(search: string, enabled = true) {
  const trimmed = search.trim();
  const query = useChatControllerSearchUsers(
    { search: trimmed || undefined, limit: 20 },
    {
      query: {
        enabled,
        staleTime: 30_000,
      },
    },
  );

  return {
    users: query.data ?? [],
    isFetching: query.isFetching,
    isFailed: query.isError,
    error: query.error,
  };
}
