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
  Link,
  Menu,
  Popover,
  Portal,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { ALLOWED_CHAT_REACTIONS, tokenizeMessageBody } from '@researchos/chat';
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import NextLink from '@/components/ui/link';
import { resolveErrorCode } from '@/utils/error-messages';
import type { ChatParticipantPayload, ChatUiMessage } from '../types';
import { resolveAuthorizedAttachmentUrl } from '../utils/attachment-upload';
import { initialsForChatName } from '../utils/message-state';
import { EntityLink } from '@/features/discovery';

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageItem({
  message,
  currentUserId,
  canModerate,
  isGroup = false,
  participants,
  isFirstInGroup = true,
  isLastInGroup = true,
  onPreviewImage,
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  onHideMessageForMe,
  onRetrySend,
}: {
  message: ChatUiMessage;
  currentUserId: string;
  canModerate: boolean;
  isGroup?: boolean;
  participants: ChatParticipantPayload[];
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onPreviewImage?: (url: string, fileName: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEditMessage: (messageId: string, body: string) => Promise<string | null>;
  onDeleteMessage: (messageId: string) => void;
  onHideMessageForMe: (messageId: string) => void;
  onRetrySend: (message: ChatUiMessage) => void;
}) {
  const t = useTranslations('chat');
  const tRemove = useTranslations('chat.removeMenu');
  const tErrors = useTranslations('errors');
  const format = useFormatter();

  const isOwn = message.senderId === currentUserId;
  const isDeleted = Boolean(message.deletedAt);
  const [isEditing, setIsEditing] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [removePromptOpen, setRemovePromptOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(message.body);
  const [editErrorCode, setEditErrorCode] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const senderName =
    message.sender?.fullName ??
    participants.find((p) => p.userId === message.senderId)?.user.fullName ??
    'Researcher';

  const otherReads = message.reads.filter((r) => r.userId !== message.senderId);
  const hasDelivered = message.receipts.some((r) => r.status === 'DELIVERED');
  const hasSent =
    message.receipts.length === 0 ||
    message.receipts.some(
      (r) => r.status === 'SENT' || r.status === 'DELIVERED',
    );

  const handleSaveEdit = async () => {
    setIsSavingEdit(true);
    setEditErrorCode(null);
    const errCode = await onEditMessage(message.id, editDraft);
    setIsSavingEdit(false);
    if (errCode) {
      setEditErrorCode(errCode);
      return;
    }
    setIsEditing(false);
  };

  const segments = tokenizeMessageBody(message.body);

  const bubbleRadius = '18px';
  const joinedRadius = '5px';
  const bubbleRadiusProps = {
    borderRadius: bubbleRadius,
    ...(isOwn
      ? {
          borderStartEndRadius: isFirstInGroup ? bubbleRadius : joinedRadius,
          borderEndEndRadius: isLastInGroup ? bubbleRadius : joinedRadius,
        }
      : {
          borderStartStartRadius: isFirstInGroup ? bubbleRadius : joinedRadius,
          borderEndStartRadius: isLastInGroup ? bubbleRadius : joinedRadius,
        }),
  };

  const isToolbarVisible = reactionPickerOpen || actionsMenuOpen;

  const renderFloatingToolbar = () => {
    if (isDeleted || message.localState || isEditing) return null;

    return (
      <HStack
        gap="0.5"
        opacity={{ base: 1, md: isToolbarVisible ? 1 : 0 }}
        _groupHover={{ opacity: 1 }}
        _focusWithin={{ opacity: 1 }}
        transition="opacity 0.15s ease-in-out"
        flexShrink={0}
        px="1"
      >
        <Popover.Root
          open={reactionPickerOpen}
          onOpenChange={(details) => setReactionPickerOpen(details.open)}
          positioning={{ placement: 'top' }}
        >
          <Popover.Trigger asChild>
            <IconButton
              type="button"
              size="2xs"
              variant="ghost"
              aria-label={t('addReaction')}
              title={t('addReaction')}
            >
              <SmilePlus size={14} />
            </IconButton>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content boxShadow="overlayPanel" w="auto" p="1">
                <HStack gap="0.5">
                  {ALLOWED_CHAT_REACTIONS.map((emoji) => (
                    <Button
                      key={emoji}
                      type="button"
                      size="2xs"
                      variant="ghost"
                      px="1.5"
                      minW="7"
                      onClick={() => {
                        setReactionPickerOpen(false);
                        onToggleReaction(message.id, emoji);
                      }}
                    >
                      {emoji}
                    </Button>
                  ))}
                </HStack>
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>

        {/*
          The removal prompt hangs off the actions button, so the button is
          its anchor. Without an anchor the popover has no reference to
          position against and lands outside the viewport.
        */}
        <Popover.Root
          open={removePromptOpen}
          onOpenChange={(details) => setRemovePromptOpen(details.open)}
          positioning={{ placement: 'top' }}
        >
          <Popover.Anchor>
            <Menu.Root
              open={actionsMenuOpen}
              onOpenChange={(details) => setActionsMenuOpen(details.open)}
              positioning={{ placement: 'top' }}
            >
              <Menu.Trigger asChild>
                <IconButton
                  type="button"
                  size="2xs"
                  variant="ghost"
                  aria-label={t('messageActions')}
                  title={t('messageActions')}
                >
                  <MoreHorizontal size={14} />
                </IconButton>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content boxShadow="overlayPanel" w="auto" p="1">
                    {isOwn && (
                      <Menu.Item
                        value="edit"
                        layerStyle="interactiveRow"
                        onSelect={() => {
                          setEditDraft(message.body);
                          setIsEditing(true);
                        }}
                      >
                        <Pencil size={13} />
                        <Menu.ItemText>{t('editAction')}</Menu.ItemText>
                      </Menu.Item>
                    )}

                    {isOwn && <Menu.Separator />}

                    <Menu.Item
                      value="delete"
                      layerStyle="interactiveRow"
                      onSelect={() => {
                        setActionsMenuOpen(false);
                        setRemovePromptOpen(true);
                      }}
                    >
                      <Trash2 size={13} />
                      <Menu.ItemText>{t('deleteAction')}</Menu.ItemText>
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          </Popover.Anchor>

          <Portal>
            <Popover.Positioner>
              <Popover.Content boxShadow="overlayPanel" w="276px" p="3">
                <Stack gap="2.5">
                  <Text textStyle="xs" fontWeight="semibold">
                    {isOwn ? tRemove('title') : tRemove('titleOther')}
                  </Text>

                  {isOwn && (
                    <Stack gap="1">
                      <Button
                        type="button"
                        size="xs"
                        variant="solid"
                        colorPalette="red"
                        w="full"
                        onClick={() => {
                          setRemovePromptOpen(false);
                          onDeleteMessage(message.id);
                        }}
                      >
                        <Trash2 size={13} />
                        {tRemove('unsendEveryone')}
                      </Button>
                      <Text textStyle="2xs" color="fg.muted">
                        {tRemove('unsendEveryoneHint')}
                      </Text>
                    </Stack>
                  )}

                  <Stack gap="1">
                    <Button
                      type="button"
                      size="xs"
                      variant={isOwn ? 'outline' : 'solid'}
                      w="full"
                      onClick={() => {
                        setRemovePromptOpen(false);
                        onHideMessageForMe(message.id);
                      }}
                    >
                      {tRemove('removeForYou')}
                    </Button>
                    <Text textStyle="2xs" color="fg.muted">
                      {tRemove('removeForYouHint')}
                    </Text>
                  </Stack>

                  {!isOwn && canModerate && (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      colorPalette="red"
                      w="full"
                      onClick={() => {
                        setRemovePromptOpen(false);
                        onDeleteMessage(message.id);
                      }}
                    >
                      <Trash2 size={13} />
                      {tRemove('moderateEveryone')}
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="2xs"
                    variant="ghost"
                    w="full"
                    onClick={() => setRemovePromptOpen(false)}
                  >
                    {tRemove('cancel')}
                  </Button>
                </Stack>
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
      </HStack>
    );
  };

  return (
    <Flex
      role="group"
      className="group"
      direction="column"
      w="full"
      mt={isFirstInGroup ? '3' : '1px'}
      align={isOwn ? 'end' : 'start'}
      data-testid={`chat-message-${message.id}`}
    >
      {/* Sender name for group chats on first message */}
      {!isOwn && isGroup && isFirstInGroup && (
        <HStack gap="2" textStyle="xs" color="fg.muted" pl="38px" mb="1">
          <EntityLink
            entityType="RESEARCHER"
            entityId={message.senderId}
            href={`/profile/${message.senderId}`}
          >
            {senderName}
          </EntityLink>
          <Text>
            {format.dateTime(new Date(message.createdAt), {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </HStack>
      )}

      {/* Main bubble + toolbar + avatar flex row */}
      <Flex
        align="end"
        gap="1.5"
        maxW={{ base: '92%', md: '80%' }}
        justify={isOwn ? 'end' : 'start'}
      >
        {/* If incoming: avatar on last message of group, or empty spacer to keep alignment */}
        {!isOwn && (
          <Box w="32px" flexShrink={0} me="1.5">
            {isLastInGroup ? (
              <Link
                asChild
                flexShrink={0}
                _hover={{ opacity: 0.85, textDecoration: 'none' }}
              >
                <NextLink href={`/profile/${message.senderId}`}>
                  <Avatar.Root size="sm">
                    <Avatar.Fallback name={senderName}>
                      {initialsForChatName(senderName)}
                    </Avatar.Fallback>
                  </Avatar.Root>
                </NextLink>
              </Link>
            ) : null}
          </Box>
        )}

        {/* If own: toolbar comes on left */}
        {isOwn && renderFloatingToolbar()}

        {/* Chat Bubble & Reactions */}
        <Box position="relative" maxW="full">
          <Box
            px="3.5"
            py="2"
            boxShadow="xs"
            {...bubbleRadiusProps}
            bg={isDeleted ? 'bg.subtle' : isOwn ? 'blue.600' : 'gray.100'}
            _dark={{
              bg: isDeleted ? 'bg.subtle' : isOwn ? 'blue.600' : 'gray.700',
            }}
            color={isDeleted ? 'fg.muted' : isOwn ? 'white' : 'fg'}
            borderWidth={isDeleted ? '1px' : '0'}
            borderColor={
              message.localState === 'failed' ? 'border.error' : 'border.subtle'
            }
            borderStyle={isDeleted ? 'dashed' : 'solid'}
            w="full"
          >
            {isDeleted ? (
              <HStack justify="space-between" gap="2">
                <Text textStyle="sm" fontStyle="italic" color="fg.muted">
                  {isOwn
                    ? t('youUnsentMessage')
                    : t('senderUnsentMessage', { name: senderName })}
                </Text>
                <IconButton
                  type="button"
                  size="2xs"
                  variant="ghost"
                  aria-label={tRemove('removeForYou')}
                  title={tRemove('removeForYou')}
                  onClick={() => onHideMessageForMe(message.id)}
                >
                  <Trash2 size={12} />
                </IconButton>
              </HStack>
            ) : isEditing ? (
              <Stack gap="2" minW={{ base: '220px', sm: '320px' }}>
                <Textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={3}
                  size="sm"
                  color="fg"
                  bg="bg.panel"
                />
                {editErrorCode && (
                  <Text textStyle="xs" color="fg.error">
                    {resolveErrorCode(
                      tErrors,
                      editErrorCode,
                      tErrors('unknown'),
                    )}
                  </Text>
                )}
                <HStack justify="end" gap="2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditDraft(message.body);
                      setEditErrorCode(null);
                    }}
                  >
                    {t('cancelEdit')}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    loading={isSavingEdit}
                    onClick={() => void handleSaveEdit()}
                  >
                    {t('saveEdit')}
                  </Button>
                </HStack>
              </Stack>
            ) : (
              <Stack gap="2">
                {message.body.length > 0 && (
                  <Text
                    textStyle="sm"
                    whiteSpace="pre-wrap"
                    overflowWrap="anywhere"
                    lineHeight="1.45"
                  >
                    {segments.map((seg, index) => {
                      if (seg.kind === 'user') {
                        return (
                          <Badge
                            key={index}
                            variant={isOwn ? 'solid' : 'subtle'}
                            bg={isOwn ? 'blue.800' : undefined}
                            color={isOwn ? 'white' : undefined}
                            colorPalette={isOwn ? undefined : 'blue'}
                            fontWeight="bold"
                            mx="0.5"
                            px="1.5"
                            rounded="sm"
                            textStyle="xs"
                          >
                            {seg.text}
                          </Badge>
                        );
                      }
                      if (seg.kind === 'all') {
                        return (
                          <Badge
                            key={index}
                            variant="solid"
                            colorPalette="orange"
                            fontWeight="bold"
                            mx="0.5"
                            px="1.5"
                            rounded="sm"
                            textStyle="xs"
                          >
                            {seg.text}
                          </Badge>
                        );
                      }
                      return <span key={index}>{seg.text}</span>;
                    })}
                  </Text>
                )}

                {message.attachments.length > 0 && (
                  <Stack gap="2">
                    {message.attachments.map((att) => {
                      const authorizedHref = resolveAuthorizedAttachmentUrl(
                        att.downloadPath,
                      );
                      if (att.isImage) {
                        return (
                          <Box
                            key={att.id}
                            borderWidth="1px"
                            borderColor={
                              isOwn ? 'blue.400' : 'border.emphasized'
                            }
                            bg={isOwn ? 'blue.700' : 'bg'}
                            p="1"
                            rounded="lg"
                            overflow="hidden"
                          >
                            <Box
                              asChild
                              w="full"
                              cursor="pointer"
                              textAlign="center"
                              _hover={{ opacity: 0.9 }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  onPreviewImage?.(
                                    authorizedHref,
                                    att.fileName,
                                  );
                                }}
                              >
                                <Image
                                  src={authorizedHref}
                                  alt={t('previewImage', {
                                    name: att.fileName,
                                  })}
                                  maxH="260px"
                                  maxW="100%"
                                  objectFit="contain"
                                  loading="lazy"
                                  mx="auto"
                                  rounded="md"
                                />
                              </button>
                            </Box>
                            <Flex
                              justify="space-between"
                              align="center"
                              pt="1"
                              px="1"
                              gap="2"
                            >
                              <Text
                                textStyle="xs"
                                color={isOwn ? 'whiteAlpha.800' : 'fg.muted'}
                                truncate
                              >
                                {att.fileName} ({formatByteSize(att.sizeBytes)})
                              </Text>
                              <Link
                                href={authorizedHref}
                                download={att.fileName}
                                textStyle="xs"
                                fontWeight="medium"
                                color={isOwn ? 'white' : 'fg'}
                              >
                                {t('downloadFile')}
                              </Link>
                            </Flex>
                          </Box>
                        );
                      }

                      return (
                        <Link
                          key={att.id}
                          href={authorizedHref}
                          download={att.fileName}
                          _hover={{ textDecoration: 'none', opacity: 0.9 }}
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          gap="3"
                          p="2"
                          bg={isOwn ? 'blue.700' : 'bg'}
                          color={isOwn ? 'white' : 'fg'}
                          borderWidth="1px"
                          borderColor={isOwn ? 'blue.500' : 'border.emphasized'}
                          rounded="md"
                        >
                          <HStack gap="2" minW="0">
                            <FileText size={16} />
                            <Box minW="0">
                              <Text textStyle="xs" fontWeight="medium" truncate>
                                {att.fileName}
                              </Text>
                              <Text
                                textStyle="2xs"
                                color={isOwn ? 'whiteAlpha.800' : 'fg.muted'}
                              >
                                {formatByteSize(att.sizeBytes)}
                              </Text>
                            </Box>
                          </HStack>
                          <Box flexShrink={0}>
                            <Download size={14} />
                          </Box>
                        </Link>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            )}
          </Box>

          {/* Attached Reactions row beneath the bubble */}
          {message.reactions.length > 0 && !isDeleted && (
            <Flex
              gap="1"
              wrap="wrap"
              mt="-6px"
              px="1"
              justify={isOwn ? 'end' : 'start'}
            >
              {message.reactions.map((r) => {
                const mine = r.userIds.includes(currentUserId);
                return (
                  <Button
                    key={r.reaction}
                    type="button"
                    size="2xs"
                    h="20px"
                    px="1.5"
                    rounded="full"
                    borderWidth="1px"
                    bg={mine ? 'blue.50' : 'bg.panel'}
                    _dark={{ bg: mine ? 'blue.950' : 'bg.panel' }}
                    borderColor={mine ? 'blue.400' : 'border.emphasized'}
                    color="fg"
                    boxShadow="sm"
                    onClick={() => onToggleReaction(message.id, r.reaction)}
                  >
                    <Text as="span" textStyle="2xs">
                      {r.reaction}
                    </Text>
                    <Text
                      as="span"
                      textStyle="2xs"
                      fontWeight="semibold"
                      ml="0.5"
                    >
                      {r.count}
                    </Text>
                  </Button>
                );
              })}
            </Flex>
          )}
        </Box>

        {/* If incoming: toolbar comes on right */}
        {!isOwn && renderFloatingToolbar()}
      </Flex>

      {/* Own-message delivery / read / retry status on last message of cluster */}
      {isOwn &&
        (isLastInGroup || message.localState === 'failed') &&
        !isDeleted && (
          <HStack gap="1.5" textStyle="xs" color="fg.muted" mt="0.5">
            {message.editedAt && (
              <Text fontStyle="italic">({t('editedBadge')})</Text>
            )}
            {message.localState === 'sending' && (
              <>
                <Clock size={12} />
                <Text>{t('delivery.sending')}</Text>
              </>
            )}
            {message.localState === 'failed' && (
              <HStack gap="2" color="fg.error">
                <AlertCircle size={12} />
                <Text>
                  {message.localErrorCode
                    ? resolveErrorCode(
                        tErrors,
                        message.localErrorCode,
                        t('delivery.failed'),
                      )
                    : t('delivery.failed')}
                </Text>
                <Button
                  type="button"
                  size="2xs"
                  variant="outline"
                  colorPalette="red"
                  onClick={() => onRetrySend(message)}
                >
                  <RotateCcw size={12} />
                  {t('retrySend')}
                </Button>
              </HStack>
            )}
            {!message.localState && otherReads.length > 0 && (
              <>
                <CheckCheck size={13} />
                <Text>
                  {participants.length > 2
                    ? t('delivery.readByCount', { count: otherReads.length })
                    : t('delivery.read')}
                </Text>
              </>
            )}
            {!message.localState && otherReads.length === 0 && hasDelivered && (
              <>
                <CheckCheck size={13} />
                <Text>{t('delivery.delivered')}</Text>
              </>
            )}
            {!message.localState &&
              otherReads.length === 0 &&
              !hasDelivered &&
              hasSent && (
                <>
                  <Check size={13} />
                  <Text>{t('delivery.sent')}</Text>
                </>
              )}
          </HStack>
        )}
    </Flex>
  );
}
