'use client';

import { useMutation } from '@tanstack/react-query';
import { chatControllerCreateConversation } from '@/lib/api';

/**
 * The social actions a viewer can take on another researcher.
 *
 * The follow action lives in the `follow` feature — it is shared by every
 * detail view — so this hook owns only the direct-chat action.
 */
export function useProfileSocial({
  targetUserId,
  isOwner = false,
}: {
  targetUserId?: string;
  isOwner?: boolean;
}) {
  const canInteract = Boolean(!isOwner && targetUserId);

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
    canInteract,
    startDirectChat: () => chatMutation.mutateAsync(),
    isStartingChat: chatMutation.isPending,
    chatFailed: chatMutation.isError,
  };
}
