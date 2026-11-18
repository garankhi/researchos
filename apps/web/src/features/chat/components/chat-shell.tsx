'use client';

import {
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Flex,
  HStack,
  IconButton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ArrowLeft, MessageSquare, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useRouter } from '@/i18n/navigation';
import { apiErrorCode } from '@/lib/api-error';
import type { ChatConversationResponseDto } from '@/lib/api/models';
import { resolveErrorCode } from '@/utils/error-messages';
import { useChatConversations } from '../hooks/use-chat-conversations';
import { useChatCurrentUser } from '../hooks/use-chat-me';
import { useChatRoom } from '../hooks/use-chat-room';
import { useChatSocket } from '../hooks/use-chat-socket';
import type { ChatParticipantPayload, ChatUserSummary } from '../types';
import { initialsForChatName } from '../utils/message-state';
import {
  ChatWorkspaceSkeleton,
  MessageHistorySkeleton,
} from './chat-skeletons';
import {
  ConversationList,
  resolveConversationTitle,
} from './conversation-list';
import { MessageComposer } from './message-composer';
import { MessageItem } from './message-item';
import { NewConversationDialog } from './new-conversation-dialog';

type RoomEventBridge = {
  onMessageCreated?: ReturnType<typeof useChatRoom>['handleLiveMessageCreated'];
  onMessageUpdated?: ReturnType<typeof useChatRoom>['handleLiveMessageUpdated'];
  onMessageDeleted?: ReturnType<typeof useChatRoom>['handleLiveMessageDeleted'];
  onTypingUpdated?: ReturnType<typeof useChatRoom>['handleLiveTypingUpdated'];
  onReadUpdated?: ReturnType<typeof useChatRoom>['handleLiveReadUpdated'];
  onReceiptUpdated?: ReturnType<typeof useChatRoom>['handleLiveReceiptUpdated'];
  onReactionUpdated?: ReturnType<
    typeof useChatRoom
  >['handleLiveReactionUpdated'];
  onReconnected?: ReturnType<typeof useChatRoom>['refreshAfterReconnect'];
};

function ActiveConversationPane({
  conversationId,
  fallbackConversation,
  currentUser,
  socket,
  bridgeRef,
  onBackToList,
}: {
  conversationId: string;
  fallbackConversation: ChatConversationResponseDto | null;
  currentUser: ChatUserSummary;
  socket: ReturnType<typeof useChatSocket>;
  bridgeRef: React.RefObject<RoomEventBridge>;
  onBackToList: () => void;
}) {
  const t = useTranslations('chat');
  const tTyping = useTranslations('chat.typing');
  const tErrors = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const room = useChatRoom({
    conversationId,
    currentUser,
    socket,
  });

  useEffect(() => {
    bridgeRef.current = {
      onMessageCreated: room.handleLiveMessageCreated,
      onMessageUpdated: room.handleLiveMessageUpdated,
      onMessageDeleted: room.handleLiveMessageDeleted,
      onTypingUpdated: room.handleLiveTypingUpdated,
      onReadUpdated: room.handleLiveReadUpdated,
      onReceiptUpdated: room.handleLiveReceiptUpdated,
      onReactionUpdated: room.handleLiveReactionUpdated,
      onReconnected: room.refreshAfterReconnect,
    };
    return () => {
      bridgeRef.current = {};
    };
  }, [
    bridgeRef,
    room.handleLiveMessageCreated,
    room.handleLiveMessageDeleted,
    room.handleLiveMessageUpdated,
    room.handleLiveReactionUpdated,
    room.handleLiveReadUpdated,
    room.handleLiveReceiptUpdated,
    room.handleLiveTypingUpdated,
    room.refreshAfterReconnect,
  ]);

  const lastMsgId = room.messages[room.messages.length - 1]?.id;
  useEffect(() => {
    if (lastMsgId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lastMsgId]);

  if (room.isConversationFailed) {
    return (
      <Box p="6">
        <ErrorState
          title={t('errors.conversationsLoadFailed')}
          message={resolveErrorCode(
            tErrors,
            apiErrorCode(room.conversationError) ?? 'server_error',
            tErrors('unknown'),
          )}
          onRetry={() => void room.refetchConversation()}
        />
      </Box>
    );
  }

  const activeConversation = room.conversation ?? fallbackConversation;
  const activeParticipants = (activeConversation?.participants ??
    []) as unknown as ChatParticipantPayload[];
  const myParticipant = activeParticipants.find(
    (p) => p.userId === currentUser.id,
  );
  const isOwner = myParticipant?.role === 'OWNER';
  const canMentionAll = activeConversation?.type === 'DIRECT' || isOwner;

  const activeTitle = activeConversation
    ? resolveConversationTitle(
        activeConversation,
        currentUser.id,
        t('untitledGroup'),
      )
    : '';

  const typingNames = room.typingUserIds.map(
    (uid) =>
      activeParticipants.find((p) => p.userId === uid)?.user.fullName ??
      'Researcher',
  );

  const typingText =
    typingNames.length === 1
      ? tTyping('one', { name: typingNames[0]! })
      : typingNames.length === 2
        ? tTyping('two', { first: typingNames[0]!, second: typingNames[1]! })
        : typingNames.length > 2
          ? tTyping('many', { count: typingNames.length })
          : null;

  return (
    <>
      <Flex
        px="4"
        py="3"
        align="center"
        justify="space-between"
        borderBottomWidth="1px"
        borderColor="border.emphasized"
        bg="bg.panel"
        gap="3"
      >
        <HStack gap="2.5" minW="0">
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            hideFrom="lg"
            aria-label={t('backToList')}
            onClick={onBackToList}
          >
            <ArrowLeft size={18} />
          </IconButton>

          {activeTitle && (
            <Avatar.Root size="sm" flexShrink={0}>
              <Avatar.Fallback name={activeTitle}>
                {initialsForChatName(activeTitle)}
              </Avatar.Fallback>
            </Avatar.Root>
          )}

          <Box minW="0">
            <Text fontWeight="semibold" textStyle="sm" truncate>
              {activeTitle || '—'}
            </Text>
            {activeConversation?.type === 'GROUP' && (
              <HStack gap="1" textStyle="xs" color="fg.muted">
                <Users size={12} />
                <Text>
                  {t('participantsCount', {
                    count: activeParticipants.length,
                  })}
                </Text>
              </HStack>
            )}
          </Box>
        </HStack>

        {activeConversation?.archivedAt && (
          <Badge variant="subtle" colorPalette="orange">
            Archived
          </Badge>
        )}
      </Flex>

      <Box flex="1" overflowY="auto" px="4" py="3" bg="bg">
        {room.isMessagesLoading ? (
          <MessageHistorySkeleton />
        ) : room.isMessagesFailed ? (
          <ErrorState
            title={t('errors.messagesLoadFailed')}
            message={resolveErrorCode(
              tErrors,
              apiErrorCode(room.messagesError) ?? 'server_error',
              tErrors('unknown'),
            )}
            onRetry={() => void room.refetchMessages()}
          />
        ) : room.messages.length === 0 ? (
          <EmptyState
            title={t('messagesEmptyTitle')}
            message={t('messagesEmptyMessage')}
          />
        ) : (
          <Stack gap="3.5">
            {room.hasOlderMessages && (
              <Flex justify="center" py="1">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  loading={room.isLoadingOlder}
                  onClick={() => void room.loadOlderMessages()}
                >
                  {room.isLoadingOlder ? t('loadingOlder') : t('loadOlder')}
                </Button>
              </Flex>
            )}

            {room.messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                currentUserId={currentUser.id}
                canModerate={isOwner}
                participants={activeParticipants}
                onToggleReaction={(messageId, emoji) => {
                  void room
                    .toggleReactionOptimistic(messageId, emoji)
                    .then((errCode) => {
                      if (errCode) {
                        showSnackbar({
                          severity: 'error',
                          message: resolveErrorCode(
                            tErrors,
                            errCode,
                            t('errors.reactionFailed'),
                          ),
                        });
                      }
                    });
                }}
                onEditMessage={room.editExistingMessage}
                onDeleteMessage={(messageId) => {
                  void room.deleteExistingMessage(messageId).then((errCode) => {
                    if (errCode) {
                      showSnackbar({
                        severity: 'error',
                        message: resolveErrorCode(
                          tErrors,
                          errCode,
                          tErrors('unknown'),
                        ),
                      });
                    }
                  });
                }}
                onRetrySend={(failed) => {
                  void room.retryFailedMessage(failed);
                }}
              />
            ))}
            <div ref={messagesEndRef} />
          </Stack>
        )}
      </Box>

      {typingText && (
        <Box
          px="4"
          py="1"
          bg="bg.subtle"
          borderTopWidth="1px"
          borderColor="border.subtle"
        >
          <Text textStyle="xs" color="fg.muted" fontStyle="italic">
            {typingText}
          </Text>
        </Box>
      )}

      <MessageComposer
        participants={activeParticipants}
        currentUserId={currentUser.id}
        canMentionAll={canMentionAll}
        disabled={Boolean(activeConversation?.archivedAt)}
        pendingAttachments={room.pendingAttachments}
        hasUploadingAttachments={room.hasUploadingAttachments}
        errorCode={room.composerErrorCode}
        onClearError={room.clearComposerError}
        onStageFiles={(files) => void room.stageFiles(files)}
        onRemoveAttachment={room.removePendingAttachment}
        onSendMessage={room.submitMessage}
        onStartTyping={() => socket.startTyping(conversationId)}
        onStopTyping={() => socket.stopTyping(conversationId)}
      />
    </>
  );
}

export function ChatShell({
  initialConversationId = null,
}: {
  initialConversationId?: string | null;
}) {
  const t = useTranslations('chat');
  const router = useRouter();
  const { showSnackbar } = useSnackbar();

  const { currentUser, isLoading: isMeLoading } = useChatCurrentUser();
  const [selectedOverride, setSelectedOverride] = useState<
    string | null | undefined
  >(undefined);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const selectedConversationId =
    selectedOverride !== undefined ? selectedOverride : initialConversationId;

  const {
    conversations,
    isInitialLoading: isConversationsLoading,
    isFailed: isConversationsFailed,
    error: conversationsError,
    refetch: refetchConversations,
    upsertLiveConversation,
  } = useChatConversations();

  const normalizedMe: ChatUserSummary | null = useMemo(
    () =>
      currentUser
        ? {
            id: currentUser.id,
            fullName: currentUser.fullName,
            email: currentUser.email,
            departmentUnit: 'FPTU',
          }
        : null,
    [currentUser],
  );

  const bridgeRef = useRef<RoomEventBridge>({});

  const handleSelectConversation = (id: string) => {
    setSelectedOverride(id);
    router.replace(`/chat/${id}`);
  };

  const socket = useChatSocket({
    enabled: Boolean(normalizedMe),
    handlers: {
      onMessageCreated: (msg) => bridgeRef.current.onMessageCreated?.(msg),
      onMessageUpdated: (msg) => bridgeRef.current.onMessageUpdated?.(msg),
      onMessageDeleted: (evt) => bridgeRef.current.onMessageDeleted?.(evt),
      onTypingUpdated: (evt) => bridgeRef.current.onTypingUpdated?.(evt),
      onReadUpdated: (evt) => bridgeRef.current.onReadUpdated?.(evt),
      onReceiptUpdated: (evt) => bridgeRef.current.onReceiptUpdated?.(evt),
      onReactionUpdated: (evt) => bridgeRef.current.onReactionUpdated?.(evt),
      onConversationUpdated: (summary) => upsertLiveConversation(summary),
      onMentionNotification: (notif) => {
        if (notif.conversationId !== selectedConversationId) {
          showSnackbar({
            severity: 'info',
            message: t('mentionedYou', {
              sender: notif.senderName,
              preview: notif.preview,
            }),
            actionLabel: t('title'),
            onAction: () => handleSelectConversation(notif.conversationId),
          });
        }
      },
      onReconnected: () => {
        void bridgeRef.current.onReconnected?.();
      },
    },
  });

  if (isMeLoading || !normalizedMe) {
    return <ChatWorkspaceSkeleton />;
  }

  const fallbackConversation =
    conversations.find((c) => c.id === selectedConversationId) ?? null;

  return (
    <Container
      as="main"
      maxW="7xl"
      py={{ base: '0', lg: '4' }}
      px={{ base: '0', lg: '4' }}
    >
      <Flex
        h={{ base: 'calc(100dvh - 68px)', lg: 'calc(100dvh - 104px)' }}
        minH="480px"
        borderWidth={{ base: '0', lg: '1px' }}
        borderColor="border.emphasized"
        bg="bg.panel"
        overflow="hidden"
      >
        <Box
          w={{ base: 'full', lg: '340px' }}
          flexShrink={0}
          display={{
            base: selectedConversationId ? 'none' : 'block',
            lg: 'block',
          }}
          h="full"
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId}
            currentUserId={normalizedMe.id}
            connectionStatus={socket.connectionStatus}
            isInitialLoading={isConversationsLoading}
            isFailed={isConversationsFailed}
            error={conversationsError}
            onRetry={() => void refetchConversations()}
            onSelectConversation={handleSelectConversation}
            onOpenNewDialog={() => setNewDialogOpen(true)}
          />
        </Box>

        <Flex
          direction="column"
          flex="1"
          minW="0"
          h="full"
          display={{
            base: selectedConversationId ? 'flex' : 'none',
            lg: 'flex',
          }}
        >
          {!selectedConversationId ? (
            <Flex flex="1" align="center" justify="center" p="6">
              <EmptyState
                title={t('selectConversationTitle')}
                message={t('selectConversationMessage')}
                action={
                  <Button
                    type="button"
                    size="sm"
                    mt="2"
                    onClick={() => setNewDialogOpen(true)}
                  >
                    <MessageSquare size={15} />
                    {t('newConversation')}
                  </Button>
                }
              />
            </Flex>
          ) : (
            <ActiveConversationPane
              key={selectedConversationId}
              conversationId={selectedConversationId}
              fallbackConversation={fallbackConversation}
              currentUser={normalizedMe}
              socket={socket}
              bridgeRef={bridgeRef}
              onBackToList={() => {
                setSelectedOverride(null);
                router.replace('/chat');
              }}
            />
          )}
        </Flex>
      </Flex>

      <NewConversationDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onCreated={(created) => handleSelectConversation(created.id)}
      />
    </Container>
  );
}
