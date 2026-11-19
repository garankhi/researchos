'use client';

import {
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';
import { MessageSquarePlus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { stripMentionIdsForPreview } from '@researchos/chat';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { apiErrorCode } from '@/lib/api-error';
import type { ChatConversationResponseDto } from '@/lib/api/models';
import { resolveErrorCode } from '@/utils/error-messages';
import type { ChatConnectionStatus } from '../types';
import { initialsForChatName } from '../utils/message-state';
import { ConversationListSkeleton } from './chat-skeletons';

export function resolveConversationTitle(
  conv: ChatConversationResponseDto,
  currentUserId: string,
  untitledFallback: string,
): string {
  if (conv.type === 'GROUP') {
    return conv.title?.trim() || untitledFallback;
  }
  const peer = conv.participants.find((p) => p.userId !== currentUserId);
  return (
    peer?.user.fullName ??
    conv.participants[0]?.user.fullName ??
    untitledFallback
  );
}

export function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  connectionStatus,
  isInitialLoading,
  isFailed,
  error,
  onRetry,
  onSelectConversation,
  onOpenNewDialog,
}: {
  conversations: ChatConversationResponseDto[];
  selectedId: string | null;
  currentUserId: string;
  connectionStatus: ChatConnectionStatus;
  isInitialLoading: boolean;
  isFailed: boolean;
  error: unknown;
  onRetry: () => void;
  onSelectConversation: (conversationId: string) => void;
  onOpenNewDialog: () => void;
}) {
  const t = useTranslations('chat');
  const tConn = useTranslations('chat.connection');
  const tErrors = useTranslations('errors');
  const format = useFormatter();

  const statusColorPalette =
    connectionStatus === 'connected'
      ? 'green'
      : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
        ? 'orange'
        : 'red';

  return (
    <Flex
      direction="column"
      h="full"
      bg="bg.panel"
      borderEndWidth={{ lg: '1px' }}
      borderColor="border.emphasized"
    >
      <Flex
        px="4"
        h="64px"
        minH="64px"
        maxH="64px"
        boxSizing="border-box"
        align="center"
        justify="space-between"
        borderBottomWidth="1px"
        borderColor="border.emphasized"
        gap="2"
      >
        <HStack gap="2">
          <Text fontWeight="semibold" textStyle="md">
            {t('title')}
          </Text>
          <Badge size="xs" variant="subtle" colorPalette={statusColorPalette}>
            {tConn(connectionStatus)}
          </Badge>
        </HStack>

        <Button
          type="button"
          size="xs"
          variant="solid"
          onClick={onOpenNewDialog}
        >
          <MessageSquarePlus size={14} />
          {t('newConversation')}
        </Button>
      </Flex>

      <Box flex="1" overflowY="auto">
        {isInitialLoading ? (
          <ConversationListSkeleton />
        ) : isFailed ? (
          <Box p="3">
            <ErrorState
              title={t('errors.conversationsLoadFailed')}
              message={resolveErrorCode(
                tErrors,
                apiErrorCode(error) ?? 'server_error',
                tErrors('unknown'),
              )}
              onRetry={onRetry}
            />
          </Box>
        ) : conversations.length === 0 ? (
          <EmptyState
            title={t('conversationsEmptyTitle')}
            message={t('conversationsEmptyMessage')}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                mt="2"
                onClick={onOpenNewDialog}
              >
                {t('newConversation')}
              </Button>
            }
          />
        ) : (
          <Stack gap="0">
            {conversations.map((conv) => {
              const title = resolveConversationTitle(
                conv,
                currentUserId,
                t('untitledGroup'),
              );
              const isSelected = conv.id === selectedId;
              const lastMsg = conv.lastMessage;
              const rawBody = lastMsg?.body
                ? stripMentionIdsForPreview(lastMsg.body).trim()
                : '';
              const previewText = lastMsg
                ? lastMsg.deletedAt
                  ? t('messageDeleted')
                  : rawBody ||
                    (lastMsg.attachments.length > 0
                      ? `📎 ${lastMsg.attachments[0]?.fileName ?? ''}`
                      : '')
                : '';

              return (
                <Flex
                  key={conv.id}
                  asChild
                  w="full"
                  textAlign="start"
                  px="3.5"
                  py="3"
                  gap="3"
                  align="center"
                  borderBottomWidth="1px"
                  borderColor="border.subtle"
                  layerStyle="interactiveRow"
                  bg={isSelected ? 'bg.muted' : undefined}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                  >
                    <Avatar.Root size="sm" flexShrink={0}>
                      <Avatar.Fallback name={title}>
                        {initialsForChatName(title)}
                      </Avatar.Fallback>
                    </Avatar.Root>

                    <Box flex="1" minW="0">
                      <Flex justify="space-between" align="baseline" gap="2">
                        <Text
                          textStyle="sm"
                          fontWeight={conv.unreadCount > 0 ? 'bold' : 'medium'}
                          truncate
                        >
                          {title}
                        </Text>
                        <Text textStyle="xs" color="fg.muted" flexShrink={0}>
                          {format.dateTime(new Date(conv.updatedAt), {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      </Flex>

                      <Flex
                        justify="space-between"
                        align="center"
                        gap="2"
                        mt="0.5"
                      >
                        <Text textStyle="xs" color="fg.muted" truncate>
                          {previewText || '—'}
                        </Text>
                        {conv.unreadCount > 0 && (
                          <Badge
                            size="xs"
                            variant="solid"
                            colorPalette="blue"
                            flexShrink={0}
                          >
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </Flex>
                    </Box>
                  </button>
                </Flex>
              );
            })}
          </Stack>
        )}
      </Box>
    </Flex>
  );
}
