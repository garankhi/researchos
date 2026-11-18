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
  Pencil,
  RotateCcw,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { resolveErrorCode } from '@/utils/error-messages';
import type { ChatParticipantPayload, ChatUiMessage } from '../types';
import { resolveAuthorizedAttachmentUrl } from '../utils/attachment-upload';
import { initialsForChatName } from '../utils/message-state';

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageItem({
  message,
  currentUserId,
  canModerate,
  participants,
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  onRetrySend,
}: {
  message: ChatUiMessage;
  currentUserId: string;
  canModerate: boolean;
  participants: ChatParticipantPayload[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEditMessage: (messageId: string, body: string) => Promise<string | null>;
  onDeleteMessage: (messageId: string) => void;
  onRetrySend: (message: ChatUiMessage) => void;
}) {
  const t = useTranslations('chat');
  const tErrors = useTranslations('errors');
  const format = useFormatter();

  const isOwn = message.senderId === currentUserId;
  const isDeleted = Boolean(message.deletedAt);
  const [isEditing, setIsEditing] = useState(false);
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

  return (
    <Flex
      gap="2.5"
      justify={isOwn ? 'end' : 'start'}
      align="start"
      w="full"
      data-testid={`chat-message-${message.id}`}
    >
      {!isOwn && (
        <Avatar.Root size="sm" flexShrink={0}>
          <Avatar.Fallback name={senderName}>
            {initialsForChatName(senderName)}
          </Avatar.Fallback>
        </Avatar.Root>
      )}

      <Stack
        gap="1"
        maxW={{ base: '86%', md: '72%' }}
        align={isOwn ? 'end' : 'start'}
      >
        <HStack gap="2" textStyle="xs" color="fg.muted">
          {!isOwn && (
            <Text fontWeight="semibold" color="fg">
              {senderName}
            </Text>
          )}
          <Text>
            {format.dateTime(new Date(message.createdAt), {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          {message.editedAt && !isDeleted && (
            <Text fontStyle="italic">({t('editedBadge')})</Text>
          )}
        </HStack>

        <Box
          px="3.5"
          py="2.5"
          borderWidth="1px"
          borderColor={
            message.localState === 'failed'
              ? 'border.error'
              : isOwn
                ? 'blue.emphasized'
                : 'border.emphasized'
          }
          bg={isDeleted ? 'bg.subtle' : isOwn ? 'blue.subtle' : 'bg.panel'}
          color="fg"
          w="full"
        >
          {isDeleted ? (
            <Text textStyle="sm" fontStyle="italic" color="fg.muted">
              {t('messageDeleted')}
            </Text>
          ) : isEditing ? (
            <Stack gap="2" minW={{ base: '220px', sm: '320px' }}>
              <Textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={3}
                size="sm"
              />
              {editErrorCode && (
                <Text textStyle="xs" color="fg.error">
                  {resolveErrorCode(tErrors, editErrorCode, tErrors('unknown'))}
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
                >
                  {segments.map((seg, index) => {
                    if (seg.kind === 'user') {
                      const isMentioningMe = seg.userId === currentUserId;
                      return (
                        <Badge
                          key={index}
                          variant={isMentioningMe ? 'solid' : 'subtle'}
                          colorPalette="blue"
                          mx="0.5"
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
                          mx="0.5"
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
                          borderColor="border.emphasized"
                          bg="bg"
                          p="1"
                        >
                          <a
                            href={authorizedHref}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Image
                              src={authorizedHref}
                              alt={t('previewImage', { name: att.fileName })}
                              maxH="260px"
                              maxW="100%"
                              objectFit="contain"
                              loading="lazy"
                            />
                          </a>
                          <Flex
                            justify="space-between"
                            align="center"
                            pt="1"
                            px="1"
                            gap="2"
                          >
                            <Text textStyle="xs" color="fg.muted" truncate>
                              {att.fileName} ({formatByteSize(att.sizeBytes)})
                            </Text>
                            <Link
                              href={authorizedHref}
                              download={att.fileName}
                              textStyle="xs"
                              fontWeight="medium"
                            >
                              {t('downloadFile')}
                            </Link>
                          </Flex>
                        </Box>
                      );
                    }

                    return (
                      <Flex
                        key={att.id}
                        align="center"
                        justify="space-between"
                        gap="3"
                        p="2"
                        bg="bg"
                        borderWidth="1px"
                        borderColor="border.emphasized"
                      >
                        <HStack gap="2" minW="0">
                          <FileText size={16} />
                          <Box minW="0">
                            <Text textStyle="xs" fontWeight="medium" truncate>
                              {att.fileName}
                            </Text>
                            <Text textStyle="xs" color="fg.muted">
                              {formatByteSize(att.sizeBytes)}
                            </Text>
                          </Box>
                        </HStack>
                        <Link
                          href={authorizedHref}
                          download={att.fileName}
                          display="inline-flex"
                          alignItems="center"
                          gap="1"
                          textStyle="xs"
                          fontWeight="medium"
                          flexShrink={0}
                        >
                          <Download size={14} />
                          {t('downloadFile')}
                        </Link>
                      </Flex>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          )}
        </Box>

        {/* Reactions & message actions row */}
        {!isDeleted && !message.localState && (
          <Flex gap="1" wrap="wrap" align="center">
            {message.reactions.map((r) => {
              const mine = r.userIds.includes(currentUserId);
              return (
                <Button
                  key={r.reaction}
                  type="button"
                  size="2xs"
                  variant={mine ? 'subtle' : 'outline'}
                  colorPalette={mine ? 'blue' : 'gray'}
                  onClick={() => onToggleReaction(message.id, r.reaction)}
                >
                  {r.reaction} {r.count}
                </Button>
              );
            })}

            <Menu.Root positioning={{ placement: 'top' }}>
              <Menu.Trigger asChild>
                <IconButton
                  type="button"
                  size="2xs"
                  variant="ghost"
                  aria-label={t('addReaction')}
                  title={t('addReaction')}
                >
                  <SmilePlus size={14} />
                </IconButton>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content boxShadow="overlayPanel" p="1">
                    <HStack gap="0.5">
                      {ALLOWED_CHAT_REACTIONS.map((emoji) => (
                        <Menu.Item
                          key={emoji}
                          value={emoji}
                          px="2"
                          py="1"
                          cursor="pointer"
                          onSelect={() => onToggleReaction(message.id, emoji)}
                        >
                          {emoji}
                        </Menu.Item>
                      ))}
                    </HStack>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>

            {isOwn && !isEditing && (
              <IconButton
                type="button"
                size="2xs"
                variant="ghost"
                aria-label={t('editAction')}
                title={t('editAction')}
                onClick={() => {
                  setEditDraft(message.body);
                  setIsEditing(true);
                }}
              >
                <Pencil size={13} />
              </IconButton>
            )}

            {(isOwn || canModerate) && !isEditing && (
              <IconButton
                type="button"
                size="2xs"
                variant="ghost"
                colorPalette="red"
                aria-label={t('deleteAction')}
                title={t('deleteAction')}
                onClick={() => onDeleteMessage(message.id)}
              >
                <Trash2 size={13} />
              </IconButton>
            )}
          </Flex>
        )}

        {/* Own-message delivery / read / retry status */}
        {isOwn && !isDeleted && (
          <HStack gap="1.5" textStyle="xs" color="fg.muted">
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
      </Stack>
    </Flex>
  );
}
