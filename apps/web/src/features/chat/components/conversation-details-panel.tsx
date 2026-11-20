'use client';

import {
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Input,
  Link,
  Separator,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { MAX_CHAT_CONVERSATION_TITLE_LENGTH } from '@researchos/chat';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  LogOut,
  MessageSquare,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { FieldError } from '@/components/ui/feedback';
import NextLink from '@/components/ui/link';
import {
  chatControllerCreateConversation,
  getChatControllerGetConversationQueryKey,
  getChatControllerListConversationsQueryKey,
  useChatControllerAddParticipant,
  useChatControllerRemoveParticipant,
  useChatControllerSearchUsers,
  useChatControllerUpdateConversation,
} from '@/lib/api';
import { apiErrorCode } from '@/lib/api-error';
import type { ChatConversationResponseDto } from '@/lib/api/models';
import { resolveErrorCode } from '@/utils/error-messages';
import type {
  ChatAttachmentPayload,
  ChatParticipantPayload,
  ChatUiMessage,
} from '../types';
import { resolveAuthorizedAttachmentUrl } from '../utils/attachment-upload';
import { initialsForChatName } from '../utils/message-state';
import {
  ImagePreviewModal,
  type ImagePreviewTarget,
} from './image-preview-modal';
import { EntityLink } from '@/features/discovery';

export function ConversationDetailsPanel({
  conversation,
  displayTitle,
  participants,
  messages,
  currentUserId,
  isOwner,
  defaultExpandMembers = false,
  onClose,
  onSelectConversation,
  onLeftGroup,
}: {
  conversation: ChatConversationResponseDto;
  displayTitle: string;
  participants: ChatParticipantPayload[];
  messages: ChatUiMessage[];
  currentUserId: string;
  isOwner: boolean;
  defaultExpandMembers?: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
  onLeftGroup: () => void;
}) {
  const t = useTranslations('chat');
  const tDetails = useTranslations('chat.details');
  const tErrors = useTranslations('errors');
  const { showSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const isGroup = conversation.type === 'GROUP';
  const myParticipant = participants.find((p) => p.userId === currentUserId);
  const isMuted = Boolean(myParticipant?.notificationMuted);
  const isArchived = Boolean(conversation.archivedAt);

  const directPartner = !isGroup
    ? (participants.find((p) => p.userId !== currentUserId) ?? participants[0])
    : null;

  const [settingsOpen, setSettingsOpen] = useState(!defaultExpandMembers);
  const [membersOpen, setMembersOpen] = useState(
    isGroup || defaultExpandMembers,
  );
  const [mediaOpen, setMediaOpen] = useState(false);

  const [groupTitleDraft, setGroupTitleDraft] = useState(
    conversation.title ?? '',
  );
  const [addingPeople, setAddingPeople] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [directLoadingUserId, setDirectLoadingUserId] = useState<string | null>(
    null,
  );
  const [previewTarget, setPreviewTarget] = useState<ImagePreviewTarget | null>(
    null,
  );

  const updateMutation = useChatControllerUpdateConversation();
  const addParticipantMutation = useChatControllerAddParticipant();
  const removeParticipantMutation = useChatControllerRemoveParticipant();

  const usersSearchQuery = useChatControllerSearchUsers(
    { search: searchTerm.trim() || undefined, limit: 15 },
    {
      query: {
        enabled: isGroup && isOwner && addingPeople,
        staleTime: 15_000,
      },
    },
  );

  const existingIds = new Set(participants.map((p) => p.userId));
  const candidateUsers = (usersSearchQuery.data ?? []).filter(
    (u) => !existingIds.has(u.id),
  );

  // Collect shared attachments from loaded messages (newest first)
  const sharedAttachments: ChatAttachmentPayload[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]!;
    if (msg.deletedAt || msg.localState) continue;
    for (const att of msg.attachments) {
      sharedAttachments.push(att);
    }
  }
  const sharedImages = sharedAttachments.filter((a) => a.isImage);
  const sharedFiles = sharedAttachments.filter((a) => !a.isImage);

  const invalidateChatState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getChatControllerGetConversationQueryKey(conversation.id),
      }),
      queryClient.invalidateQueries({
        queryKey: getChatControllerListConversationsQueryKey({
          includeArchived: false,
        }),
      }),
    ]);
  };

  const handleError = (err: unknown) => {
    const code = apiErrorCode(err);
    setActionError(
      code
        ? resolveErrorCode(tErrors, code, tDetails('settingsError'))
        : tDetails('settingsError'),
    );
  };

  const handleToggleMute = async () => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        conversationId: conversation.id,
        data: { notificationMuted: !isMuted },
      });
      await invalidateChatState();
      showSnackbar({
        severity: 'success',
        message: tDetails(isMuted ? 'unmutedToast' : 'mutedToast'),
      });
    } catch (err) {
      handleError(err);
    }
  };

  const handleSaveGroupTitle = async () => {
    setActionError(null);
    const trimmed = groupTitleDraft.trim();
    try {
      await updateMutation.mutateAsync({
        conversationId: conversation.id,
        data: { title: trimmed || null },
      });
      await invalidateChatState();
      showSnackbar({
        severity: 'success',
        message: tDetails('groupRenamedToast'),
      });
    } catch (err) {
      handleError(err);
    }
  };

  const handleToggleArchive = async () => {
    setActionError(null);
    try {
      await updateMutation.mutateAsync({
        conversationId: conversation.id,
        data: { archived: !isArchived },
      });
      await invalidateChatState();
      showSnackbar({
        severity: 'success',
        message: tDetails(isArchived ? 'unarchivedToast' : 'archivedToast'),
      });
    } catch (err) {
      handleError(err);
    }
  };

  const handleAddMember = async (userId: string, fullName: string) => {
    setActionError(null);
    try {
      await addParticipantMutation.mutateAsync({
        conversationId: conversation.id,
        data: { userId },
      });
      await invalidateChatState();
      showSnackbar({
        severity: 'success',
        message: tDetails('memberAddedToast', { name: fullName }),
      });
    } catch (err) {
      handleError(err);
    }
  };

  const handleRemoveMember = async (userId: string, fullName: string) => {
    setActionError(null);
    try {
      await removeParticipantMutation.mutateAsync({
        conversationId: conversation.id,
        participantId: userId,
      });
      await invalidateChatState();
      showSnackbar({
        severity: 'success',
        message: tDetails('memberRemovedToast', { name: fullName }),
      });
    } catch (err) {
      handleError(err);
    }
  };

  const handleLeaveGroup = async () => {
    setActionError(null);
    try {
      await removeParticipantMutation.mutateAsync({
        conversationId: conversation.id,
        participantId: currentUserId,
      });
      await invalidateChatState();
      showSnackbar({
        severity: 'info',
        message: tDetails('leftGroupToast'),
      });
      onLeftGroup();
    } catch (err) {
      handleError(err);
    }
  };

  const handleStartDirectWithMember = async (memberUserId: string) => {
    setActionError(null);
    setDirectLoadingUserId(memberUserId);
    try {
      const direct = await chatControllerCreateConversation({
        type: 'DIRECT',
        participantIds: [memberUserId],
      });
      await queryClient.invalidateQueries({
        queryKey: getChatControllerListConversationsQueryKey({
          includeArchived: false,
        }),
      });
      onSelectConversation(direct.id);
    } catch (err) {
      handleError(err);
    } finally {
      setDirectLoadingUserId(null);
    }
  };

  const ownerCount = participants.filter((p) => p.role === 'OWNER').length;
  const canLeaveGroup = isGroup && (!isOwner || ownerCount > 1);

  return (
    <Flex
      direction="column"
      h="full"
      w="full"
      bg="bg.panel"
      borderLeftWidth={{ base: '0', xl: '1px' }}
      borderColor="border.emphasized"
    >
      {/* Top Close / Title Bar */}
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
      >
        <Text fontWeight="semibold" textStyle="sm">
          {tDetails('togglePanel')}
        </Text>
        <IconButton
          type="button"
          variant="ghost"
          size="xs"
          aria-label={tDetails('closePanel')}
          onClick={onClose}
        >
          <X size={16} />
        </IconButton>
      </Flex>

      <Box flex="1" overflowY="auto">
        {/* Messenger Identity Hero */}
        <Stack align="center" textAlign="center" gap="2.5" px="4" py="5">
          <Avatar.Root size="xl">
            <Avatar.Fallback name={displayTitle}>
              {isGroup ? (
                <Users size={24} />
              ) : (
                initialsForChatName(displayTitle)
              )}
            </Avatar.Fallback>
          </Avatar.Root>

          <Box minW="0" maxW="full">
            {directPartner ? (
              <EntityLink
                entityType="RESEARCHER"
                entityId={directPartner.userId}
                href={`/profile/${directPartner.userId}`}
              >
                {displayTitle}
              </EntityLink>
            ) : (
              <Text fontWeight="bold" textStyle="md" truncate>
                {displayTitle}
              </Text>
            )}

            <Text textStyle="xs" color="fg.muted" mt="0.5">
              {isGroup
                ? `${t('groupChat')} · ${t('participantsCount', { count: participants.length })}`
                : (directPartner?.user.departmentUnit ??
                  directPartner?.user.email ??
                  t('directChat'))}
            </Text>
          </Box>

          {/* Messenger Quick Social Action Pills */}
          <HStack gap="2" pt="1" wrap="wrap" justify="center">
            {directPartner ? (
              <Button asChild variant="outline" size="xs">
                <NextLink href={`/profile/${directPartner.userId}`}>
                  <UserRound size={14} />
                  {tDetails('viewProfile')}
                </NextLink>
              </Button>
            ) : null}

            <Button
              type="button"
              variant={isMuted ? 'subtle' : 'outline'}
              size="xs"
              loading={updateMutation.isPending}
              onClick={() => void handleToggleMute()}
            >
              {isMuted ? <BellOff size={14} /> : <Bell size={14} />}
              {tDetails(isMuted ? 'unmute' : 'mute')}
            </Button>
          </HStack>

          {actionError ? <FieldError>{actionError}</FieldError> : null}
        </Stack>

        <Separator />

        {/* Section 1: Chat Settings (Rename Group, Archive, Leave) */}
        <Box borderBottomWidth="1px" borderColor="border">
          <Flex
            asChild
            w="full"
            px="4"
            py="3"
            align="center"
            justify="space-between"
            layerStyle="interactiveRow"
          >
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
            >
              <Text textStyle="sm" fontWeight="semibold">
                {tDetails('settingsSection')}
              </Text>
              {settingsOpen ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          </Flex>

          {settingsOpen && (
            <Stack gap="3" px="4" pb="4" pt="1">
              {isGroup && isOwner ? (
                <Stack gap="1.5">
                  <Text textStyle="xs" color="fg.muted" fontWeight="medium">
                    {tDetails('groupNameLabel')}
                  </Text>
                  <HStack gap="1.5">
                    <Input
                      size="sm"
                      value={groupTitleDraft}
                      maxLength={MAX_CHAT_CONVERSATION_TITLE_LENGTH}
                      placeholder={t('groupTitlePlaceholder')}
                      onChange={(e) => setGroupTitleDraft(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      loading={updateMutation.isPending}
                      onClick={() => void handleSaveGroupTitle()}
                    >
                      {tDetails('saveGroupName')}
                    </Button>
                  </HStack>
                </Stack>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="xs"
                justifyContent="flex-start"
                loading={updateMutation.isPending}
                onClick={() => void handleToggleArchive()}
              >
                {isArchived ? (
                  <ArchiveRestore size={14} />
                ) : (
                  <Archive size={14} />
                )}
                {tDetails(isArchived ? 'unarchiveChat' : 'archiveChat')}
              </Button>

              {canLeaveGroup ? (
                <Button
                  type="button"
                  variant="outline"
                  colorPalette="red"
                  size="xs"
                  justifyContent="flex-start"
                  loading={removeParticipantMutation.isPending}
                  onClick={() => void handleLeaveGroup()}
                >
                  <LogOut size={14} />
                  {tDetails('leaveGroup')}
                </Button>
              ) : null}
            </Stack>
          )}
        </Box>

        {/* Section 2: Chat Members / Participants */}
        <Box borderBottomWidth="1px" borderColor="border">
          <Flex
            asChild
            w="full"
            px="4"
            py="3"
            align="center"
            justify="space-between"
            layerStyle="interactiveRow"
          >
            <button
              type="button"
              onClick={() => setMembersOpen((prev) => !prev)}
            >
              <Text textStyle="sm" fontWeight="semibold">
                {tDetails('membersSection', { count: participants.length })}
              </Text>
              {membersOpen ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          </Flex>

          {membersOpen && (
            <Stack gap="2.5" px="4" pb="4" pt="1">
              {isGroup && isOwner ? (
                <Box>
                  <Button
                    type="button"
                    size="xs"
                    variant={addingPeople ? 'outline' : 'solid'}
                    w="full"
                    onClick={() => {
                      setAddingPeople((prev) => !prev);
                      setSearchTerm('');
                    }}
                  >
                    {addingPeople ? <X size={14} /> : <UserPlus size={14} />}
                    {tDetails(addingPeople ? 'cancelAdd' : 'addPeople')}
                  </Button>

                  {addingPeople && (
                    <Stack
                      gap="2"
                      mt="2"
                      p="2.5"
                      bg="bg.subtle"
                      borderWidth="1px"
                      borderColor="border"
                    >
                      <Input
                        size="xs"
                        bg="bg.panel"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={tDetails('searchToAddPlaceholder')}
                      />

                      {candidateUsers.length === 0 ? (
                        <Text textStyle="xs" color="fg.muted">
                          {tDetails('noUsersFound')}
                        </Text>
                      ) : (
                        <Stack gap="1.5" maxH="180px" overflowY="auto">
                          {candidateUsers.map((user) => (
                            <Flex
                              key={user.id}
                              align="center"
                              justify="space-between"
                              gap="2"
                            >
                              <Box minW="0" flex="1">
                                <Text
                                  textStyle="xs"
                                  fontWeight="semibold"
                                  truncate
                                >
                                  {user.fullName}
                                </Text>
                                <Text textStyle="xs" color="fg.muted" truncate>
                                  {user.departmentUnit}
                                </Text>
                              </Box>
                              <Button
                                type="button"
                                size="2xs"
                                loading={addParticipantMutation.isPending}
                                onClick={() =>
                                  void handleAddMember(user.id, user.fullName)
                                }
                              >
                                {tDetails('addButton')}
                              </Button>
                            </Flex>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  )}
                </Box>
              ) : null}

              <Stack gap="2">
                {participants.map((p) => {
                  const isSelf = p.userId === currentUserId;
                  const isParticipantOwner = p.role === 'OWNER';

                  return (
                    <Flex
                      key={p.userId}
                      align="center"
                      justify="space-between"
                      gap="2"
                      py="1"
                    >
                      <HStack gap="2.5" minW="0" flex="1">
                        <Avatar.Root size="xs" flexShrink={0}>
                          <Avatar.Fallback name={p.user.fullName}>
                            {initialsForChatName(p.user.fullName)}
                          </Avatar.Fallback>
                        </Avatar.Root>

                        <Box minW="0" flex="1">
                          <HStack gap="1.5" wrap="wrap">
                            <Link
                              asChild
                              textStyle="xs"
                              fontWeight="semibold"
                              layerStyle="researchTextLink"
                              truncate
                            >
                              <NextLink
                                href={
                                  isSelf
                                    ? '/profile/my-profile'
                                    : `/profile/${p.userId}`
                                }
                              >
                                {p.user.fullName}
                              </NextLink>
                            </Link>

                            {isSelf ? (
                              <Badge
                                size="xs"
                                variant="outline"
                                colorPalette="gray"
                              >
                                {tDetails('youBadge')}
                              </Badge>
                            ) : null}

                            {isGroup && isParticipantOwner ? (
                              <Badge
                                size="xs"
                                variant="subtle"
                                colorPalette="blue"
                              >
                                {tDetails('ownerBadge')}
                              </Badge>
                            ) : null}
                          </HStack>

                          <Text textStyle="xs" color="fg.muted" truncate>
                            {p.user.departmentUnit}
                          </Text>
                        </Box>
                      </HStack>

                      {!isSelf ? (
                        <HStack gap="0.5" flexShrink={0}>
                          {isGroup ? (
                            <IconButton
                              type="button"
                              size="2xs"
                              variant="ghost"
                              loading={directLoadingUserId === p.userId}
                              aria-label={tDetails('messageMember', {
                                name: p.user.fullName,
                              })}
                              title={tDetails('messageMember', {
                                name: p.user.fullName,
                              })}
                              onClick={() =>
                                void handleStartDirectWithMember(p.userId)
                              }
                            >
                              <MessageSquare size={13} />
                            </IconButton>
                          ) : null}

                          {isGroup && isOwner ? (
                            <IconButton
                              type="button"
                              size="2xs"
                              variant="ghost"
                              colorPalette="red"
                              loading={removeParticipantMutation.isPending}
                              aria-label={tDetails('removeMember')}
                              title={tDetails('removeMember')}
                              onClick={() =>
                                void handleRemoveMember(
                                  p.userId,
                                  p.user.fullName,
                                )
                              }
                            >
                              <UserMinus size={13} />
                            </IconButton>
                          ) : null}
                        </HStack>
                      ) : null}
                    </Flex>
                  );
                })}
              </Stack>
            </Stack>
          )}
        </Box>

        {/* Section 3: Shared Media & Files */}
        <Box>
          <Flex
            asChild
            w="full"
            px="4"
            py="3"
            align="center"
            justify="space-between"
            layerStyle="interactiveRow"
          >
            <button type="button" onClick={() => setMediaOpen((prev) => !prev)}>
              <Text textStyle="sm" fontWeight="semibold">
                {tDetails('mediaSection', { count: sharedAttachments.length })}
              </Text>
              {mediaOpen ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          </Flex>

          {mediaOpen && (
            <Stack gap="3" px="4" pb="4" pt="1">
              {sharedAttachments.length === 0 ? (
                <Text textStyle="xs" color="fg.muted">
                  {tDetails('noMedia')}
                </Text>
              ) : (
                <>
                  {sharedImages.length > 0 ? (
                    <Stack gap="1.5">
                      <Text textStyle="xs" color="fg.muted" fontWeight="medium">
                        {tDetails('photosLabel')} ({sharedImages.length})
                      </Text>
                      <SimpleGrid columns={3} gap="1.5">
                        {sharedImages.map((img) => {
                          const href = resolveAuthorizedAttachmentUrl(
                            img.downloadPath,
                          );
                          return (
                            <Box
                              key={img.id}
                              asChild
                              aspectRatio="square"
                              borderWidth="1px"
                              borderColor="border"
                              overflow="hidden"
                              bg="bg.muted"
                              cursor="pointer"
                              _hover={{ opacity: 0.85 }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewTarget({
                                    url: href,
                                    fileName: img.fileName,
                                  })
                                }
                              >
                                <Image
                                  src={href}
                                  alt={img.fileName}
                                  w="full"
                                  h="full"
                                  objectFit="cover"
                                  loading="lazy"
                                />
                              </button>
                            </Box>
                          );
                        })}
                      </SimpleGrid>
                    </Stack>
                  ) : null}

                  {sharedFiles.length > 0 ? (
                    <Stack gap="1.5">
                      <Text textStyle="xs" color="fg.muted" fontWeight="medium">
                        {tDetails('filesLabel')} ({sharedFiles.length})
                      </Text>
                      {sharedFiles.map((file) => {
                        const href = resolveAuthorizedAttachmentUrl(
                          file.downloadPath,
                        );
                        return (
                          <Link
                            key={file.id}
                            href={href}
                            download={file.fileName}
                            _hover={{ bg: 'bg.muted', textDecoration: 'none' }}
                            display="flex"
                            alignItems="center"
                            justifyContent="space-between"
                            gap="2"
                            p="2"
                            borderWidth="1px"
                            borderColor="border"
                            bg="bg.subtle"
                            rounded="sm"
                          >
                            <HStack gap="2" minW="0">
                              <FileText size={14} />
                              <Text textStyle="xs" truncate>
                                {file.fileName}
                              </Text>
                            </HStack>
                            <Box flexShrink={0}>
                              <Download size={14} />
                            </Box>
                          </Link>
                        );
                      })}
                    </Stack>
                  ) : null}
                </>
              )}
            </Stack>
          )}
        </Box>
      </Box>

      <ImagePreviewModal
        target={previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
    </Flex>
  );
}
