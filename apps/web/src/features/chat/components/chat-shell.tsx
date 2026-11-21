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
import { ArrowLeft, Info, MessageSquare, Users } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { getPathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
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
import { ConversationDetailsPanel } from './conversation-details-panel';
import {
  ConversationList,
  resolveConversationTitle,
} from './conversation-list';
import { MessageComposer } from './message-composer';
import { MessageItem } from './message-item';
import {
  ImagePreviewModal,
  type ImagePreviewTarget,
} from './image-preview-modal';
import { NewConversationDialog } from './new-conversation-dialog';
import { EntityLink } from '@/features/discovery';

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

function hiddenMessagesStorageKey(userId: string): string {
  return `researchos:chat:hidden-messages:${userId}`;
}

function loadHiddenMessageIds(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(hiddenMessagesStorageKey(userId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((item): item is string => typeof item === 'string'),
    );
  } catch {
    return new Set();
  }
}

function saveHiddenMessageIds(userId: string, ids: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      hiddenMessagesStorageKey(userId),
      JSON.stringify(Array.from(ids)),
    );
  } catch {
    // Ignore storage quota errors safely
  }
}

function ActiveConversationPane({
  conversationId,
  fallbackConversation,
  currentUser,
  socket,
  bridgeRef,
  hiddenMessageIds,
  onHideMessageForMe,
  onBackToList,
  onSelectConversation,
}: {
  conversationId: string;
  fallbackConversation: ChatConversationResponseDto | null;
  currentUser: ChatUserSummary;
  socket: ReturnType<typeof useChatSocket>;
  bridgeRef: React.RefObject<RoomEventBridge>;
  hiddenMessageIds: ReadonlySet<string>;
  onHideMessageForMe: (messageId: string) => void;
  onBackToList: () => void;
  onSelectConversation: (nextId: string) => void;
}) {
  const t = useTranslations('chat');
  const tDetails = useTranslations('chat.details');
  const tTyping = useTranslations('chat.typing');
  const tErrors = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const initialAnchoredRef = useRef(false);
  const prevLastMsgIdRef = useRef<string | undefined>(undefined);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expandMembersKey, setExpandMembersKey] = useState(0);
  const [previewImageTarget, setPreviewImageTarget] =
    useState<ImagePreviewTarget | null>(null);

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

  const visibleMessages = useMemo(
    () => room.messages.filter((m) => !hiddenMessageIds.has(m.id)),
    [room.messages, hiddenMessageIds],
  );

  const lastMsgId = visibleMessages[visibleMessages.length - 1]?.id;

  // Anchor scroll position synchronously BEFORE browser paint so entering a
  // conversation starts immediately at the latest message with zero visible animation.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || visibleMessages.length === 0) return;

    if (!initialAnchoredRef.current) {
      el.scrollTop = el.scrollHeight;
      initialAnchoredRef.current = true;
      prevLastMsgIdRef.current = lastMsgId;
      return;
    }

    if (lastMsgId && lastMsgId !== prevLastMsgIdRef.current) {
      prevLastMsgIdRef.current = lastMsgId;
      el.scrollTop = el.scrollHeight;
    }
  }, [lastMsgId, visibleMessages.length]);

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
  const isGroup = activeConversation?.type === 'GROUP';
  const canMentionAll = activeConversation?.type === 'DIRECT' || isOwner;

  const directPartner = !isGroup
    ? (activeParticipants.find((p) => p.userId !== currentUser.id) ??
      activeParticipants[0])
    : null;

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

  const openMembersView = () => {
    setExpandMembersKey((k) => k + 1);
    setDetailsOpen(true);
  };

  return (
    <Flex flex="1" minW="0" h="full" overflow="hidden">
      {/* Center Message Thread Column */}
      <Flex
        direction="column"
        flex="1"
        minW="0"
        h="full"
        display={{
          base: detailsOpen ? 'none' : 'flex',
          xl: 'flex',
        }}
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
                  {isGroup ? (
                    <Users size={15} />
                  ) : (
                    initialsForChatName(activeTitle)
                  )}
                </Avatar.Fallback>
              </Avatar.Root>
            )}

            <Box minW="0">
              {directPartner ? (
                <EntityLink
                  entityType="RESEARCHER"
                  entityId={directPartner.userId}
                  href={`/profile/${directPartner.userId}`}
                >
                  {activeTitle || '—'}
                </EntityLink>
              ) : (
                <Text fontWeight="semibold" textStyle="sm" truncate>
                  {activeTitle || '—'}
                </Text>
              )}

              {isGroup ? (
                <Button
                  type="button"
                  variant="plain"
                  size="2xs"
                  px="0"
                  minW="0"
                  h="auto"
                  color="fg.muted"
                  layerStyle="researchTextLink"
                  onClick={openMembersView}
                >
                  <Users size={12} />
                  <Text as="span" textStyle="xs">
                    {t('participantsCount', {
                      count: activeParticipants.length,
                    })}
                  </Text>
                </Button>
              ) : directPartner?.user.departmentUnit ? (
                <Text textStyle="xs" color="fg.muted" truncate>
                  {directPartner.user.departmentUnit}
                </Text>
              ) : null}
            </Box>
          </HStack>

          <HStack gap="2" flexShrink={0}>
            {activeConversation?.archivedAt && (
              <Badge variant="subtle" colorPalette="orange">
                Archived
              </Badge>
            )}

            <IconButton
              type="button"
              variant={detailsOpen ? 'subtle' : 'ghost'}
              colorPalette={detailsOpen ? 'blue' : 'gray'}
              size="sm"
              aria-label={tDetails('togglePanel')}
              title={tDetails('togglePanel')}
              aria-pressed={detailsOpen}
              onClick={() => setDetailsOpen((prev) => !prev)}
            >
              <Info size={18} />
            </IconButton>
          </HStack>
        </Flex>

        <Box
          ref={scrollContainerRef}
          flex="1"
          overflowY="auto"
          px="4"
          py="3"
          bg="bg"
        >
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
          ) : visibleMessages.length === 0 ? (
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

              {visibleMessages.map((msg, index) => {
                const prev = visibleMessages[index - 1];
                const next = visibleMessages[index + 1];

                const isSameSenderAsPrev = Boolean(
                  prev &&
                  prev.senderId === msg.senderId &&
                  !prev.deletedAt &&
                  !msg.deletedAt &&
                  new Date(msg.createdAt).getTime() -
                    new Date(prev.createdAt).getTime() <
                    5 * 60 * 1000,
                );

                const isSameSenderAsNext = Boolean(
                  next &&
                  next.senderId === msg.senderId &&
                  !next.deletedAt &&
                  !msg.deletedAt &&
                  new Date(next.createdAt).getTime() -
                    new Date(msg.createdAt).getTime() <
                    5 * 60 * 1000,
                );

                const isFirstInGroup = !isSameSenderAsPrev;
                const isLastInGroup = !isSameSenderAsNext;

                return (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    currentUserId={currentUser.id}
                    canModerate={isGroup && isOwner}
                    isGroup={isGroup}
                    participants={activeParticipants}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                    onPreviewImage={(url, fileName) =>
                      setPreviewImageTarget({ url, fileName })
                    }
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
                      void room
                        .deleteExistingMessage(messageId)
                        .then((errCode) => {
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
                    onHideMessageForMe={onHideMessageForMe}
                    onRetrySend={(failed) => {
                      void room.retryFailedMessage(failed);
                    }}
                  />
                );
              })}
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
      </Flex>

      {/* Right Messenger-style Conversation Details & Group Settings Sidebar */}
      {detailsOpen && activeConversation ? (
        <Box w={{ base: 'full', xl: '320px' }} flexShrink={0} h="full">
          <ConversationDetailsPanel
            key={`${activeConversation.id}:${expandMembersKey}`}
            conversation={activeConversation}
            displayTitle={activeTitle || t('untitledGroup')}
            participants={activeParticipants}
            messages={room.messages}
            currentUserId={currentUser.id}
            isOwner={isOwner}
            defaultExpandMembers={expandMembersKey > 0}
            onClose={() => setDetailsOpen(false)}
            onSelectConversation={onSelectConversation}
            onLeftGroup={onBackToList}
          />
        </Box>
      ) : null}

      <ImagePreviewModal
        target={previewImageTarget}
        onClose={() => setPreviewImageTarget(null)}
      />
    </Flex>
  );
}

export function ChatShell({
  initialConversationId = null,
}: {
  initialConversationId?: string | null;
}) {
  const t = useTranslations('chat');
  const tRemove = useTranslations('chat.removeMenu');
  const locale = useLocale() as Locale;
  const params = useParams<{ conversationId?: string }>();
  const { showSnackbar } = useSnackbar();

  const routeConversationId =
    typeof params?.conversationId === 'string'
      ? params.conversationId
      : (initialConversationId ?? null);

  const { currentUser, isLoading: isMeLoading } = useChatCurrentUser();
  const [manualSelection, setManualSelection] = useState<{
    baseRouteId: string | null;
    selectedId: string | null;
  } | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const [hiddenByUser, setHiddenByUser] = useState<{
    userId: string;
    ids: Set<string>;
  } | null>(null);

  const selectedConversationId =
    manualSelection && manualSelection.baseRouteId === routeConversationId
      ? manualSelection.selectedId
      : routeConversationId;

  // Support browser Back/Forward without page reload
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const match = /\/chat\/([^/?#]+)/.exec(window.location.pathname);
      setManualSelection({
        baseRouteId: routeConversationId,
        selectedId: match?.[1] ?? null,
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [routeConversationId]);

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

  const hiddenMessageIds = useMemo(() => {
    if (!normalizedMe) return new Set<string>();
    if (hiddenByUser?.userId === normalizedMe.id) return hiddenByUser.ids;
    return loadHiddenMessageIds(normalizedMe.id);
  }, [hiddenByUser, normalizedMe]);

  const handleHideMessageForMe = useCallback(
    (messageId: string) => {
      if (!normalizedMe) return;
      const uid = normalizedMe.id;
      setHiddenByUser((prev) => {
        const base =
          prev?.userId === uid ? prev.ids : loadHiddenMessageIds(uid);
        const next = new Set(base);
        next.add(messageId);
        saveHiddenMessageIds(uid, next);
        return { userId: uid, ids: next };
      });

      showSnackbar({
        severity: 'info',
        message: tRemove('hiddenToast'),
        actionLabel: tRemove('undo'),
        onAction: () => {
          setHiddenByUser((prev) => {
            const base =
              prev?.userId === uid ? prev.ids : loadHiddenMessageIds(uid);
            const next = new Set(base);
            next.delete(messageId);
            saveHiddenMessageIds(uid, next);
            return { userId: uid, ids: next };
          });
        },
      });
    },
    [normalizedMe, showSnackbar, tRemove],
  );

  const bridgeRef = useRef<RoomEventBridge>({});

  const handleSelectConversation = useCallback(
    (id: string) => {
      setManualSelection({
        baseRouteId: routeConversationId,
        selectedId: id,
      });
      if (typeof window !== 'undefined') {
        const nextPath = getPathname({ locale, href: `/chat/${id}` });
        window.history.replaceState(window.history.state, '', nextPath);
      }
    },
    [locale, routeConversationId],
  );

  const handleBackToList = useCallback(() => {
    setManualSelection({
      baseRouteId: routeConversationId,
      selectedId: null,
    });
    if (typeof window !== 'undefined') {
      const nextPath = getPathname({ locale, href: '/chat' });
      window.history.replaceState(window.history.state, '', nextPath);
    }
  }, [locale, routeConversationId]);

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
              hiddenMessageIds={hiddenMessageIds}
              onHideMessageForMe={handleHideMessageForMe}
              onSelectConversation={handleSelectConversation}
              onBackToList={handleBackToList}
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
