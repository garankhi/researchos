'use client';

import {
  Badge,
  Box,
  Button,
  FileUpload,
  Flex,
  HStack,
  IconButton,
  Progress,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import {
  ALLOWED_CHAT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_MESSAGE_BODY_LENGTH,
  formatUserMentionToken,
} from '@researchos/chat';
import { AtSign, Paperclip, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { FieldError } from '@/components/ui/feedback';
import { resolveErrorCode } from '@/utils/error-messages';
import type { ChatParticipantPayload, PendingAttachmentItem } from '../types';

interface ActiveMentionQuery {
  triggerIndex: number;
  query: string;
}

function detectActiveMention(
  text: string,
  caretPos: number,
): ActiveMentionQuery | null {
  const beforeCaret = text.slice(0, caretPos);
  const match = /(?:^|[\s(])@([^\s@[\]]{0,40})$/.exec(beforeCaret);
  if (!match) return null;
  const query = match[1] ?? '';
  const triggerIndex = caretPos - query.length - 1;
  return { triggerIndex, query };
}

export function MessageComposer({
  participants,
  currentUserId,
  canMentionAll,
  disabled,
  pendingAttachments,
  hasUploadingAttachments,
  errorCode,
  onClearError,
  onStageFiles,
  onRemoveAttachment,
  onSendMessage,
  onStartTyping,
  onStopTyping,
}: {
  participants: ChatParticipantPayload[];
  currentUserId: string;
  canMentionAll: boolean;
  disabled?: boolean;
  pendingAttachments: PendingAttachmentItem[];
  hasUploadingAttachments: boolean;
  errorCode: string | null;
  onClearError: () => void;
  onStageFiles: (files: File[]) => void;
  onRemoveAttachment: (localId: string) => void;
  onSendMessage: (body: string) => Promise<boolean>;
  onStartTyping: () => void;
  onStopTyping: () => void;
}) {
  const t = useTranslations('chat');
  const tErrors = useTranslations('errors');

  const [body, setBody] = useState('');
  const [caretPos, setCaretPos] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const lastTypingEmitRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeMention = useMemo(
    () => detectActiveMention(body, caretPos),
    [body, caretPos],
  );

  const mentionCandidates = useMemo(() => {
    if (!activeMention) return [];
    const q = activeMention.query.toLowerCase();
    const otherParticipants = participants.filter(
      (p) =>
        p.userId !== currentUserId &&
        (p.user.fullName.toLowerCase().includes(q) ||
          p.user.email.toLowerCase().includes(q)),
    );
    const includeAll = canMentionAll && 'all'.startsWith(q);
    return {
      includeAll,
      users: otherParticipants.slice(0, 8),
    };
  }, [activeMention, canMentionAll, currentUserId, participants]);

  const hasSuggestions =
    activeMention !== null &&
    !Array.isArray(mentionCandidates) &&
    (mentionCandidates.includeAll || mentionCandidates.users.length > 0);

  const insertMentionToken = (replacement: string) => {
    if (!activeMention) return;
    const prefix = body.slice(0, activeMention.triggerIndex);
    const suffix = body.slice(caretPos);
    const nextValue = `${prefix}${replacement} ${suffix}`;
    const nextCaret = prefix.length + replacement.length + 1;
    setBody(nextValue);
    setCaretPos(nextCaret);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleTextChange = (nextText: string, nextCaret: number) => {
    if (errorCode) {
      onClearError();
    }
    setBody(nextText);
    setCaretPos(nextCaret);

    if (nextText.trim().length === 0) {
      onStopTyping();
      lastTypingEmitRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2000) {
      lastTypingEmitRef.current = now;
      onStartTyping();
    }
  };

  const handleSubmit = async () => {
    if (disabled || isSending || hasUploadingAttachments) return;
    const hasReadyAttachments = pendingAttachments.some(
      (a) => a.status === 'ready',
    );
    if (body.trim().length === 0 && !hasReadyAttachments) return;

    const currentBody = body;
    setIsSending(true);
    onStopTyping();
    lastTypingEmitRef.current = 0;
    setBody('');
    setCaretPos(0);

    const ok = await onSendMessage(currentBody);
    setIsSending(false);
    if (!ok) {
      // Message stays visible in message list with Failed + Retry action.
    }
  };

  const readyAttachmentCount = pendingAttachments.filter(
    (a) => a.status === 'ready',
  ).length;
  const canSend =
    !disabled &&
    !isSending &&
    !hasUploadingAttachments &&
    (body.trim().length > 0 || readyAttachmentCount > 0);

  const attachDisabled =
    Boolean(disabled) ||
    pendingAttachments.length >= MAX_CHAT_ATTACHMENTS_PER_MESSAGE;

  return (
    <Box
      borderTopWidth="1px"
      borderColor="border.emphasized"
      bg="bg.panel"
      p="3"
      position="relative"
    >
      {/* Mention Autocomplete Popup */}
      {hasSuggestions && !Array.isArray(mentionCandidates) && (
        <Box
          position="absolute"
          bottom="100%"
          insetInline="3"
          mb="1"
          bg="bg.panel"
          borderWidth="1px"
          borderColor="border.emphasized"
          boxShadow="overlayPanel"
          maxH="220px"
          overflowY="auto"
          zIndex="popover"
          role="listbox"
        >
          {mentionCandidates.includeAll && (
            <Flex
              asChild
              w="full"
              px="3"
              py="2"
              align="center"
              gap="2"
              layerStyle="interactiveRow"
            >
              <button type="button" onClick={() => insertMentionToken('@all')}>
                <Badge variant="solid" colorPalette="blue">
                  @all
                </Badge>
                <Text textStyle="xs" color="fg.muted">
                  {t('mentionAllLabel')}
                </Text>
              </button>
            </Flex>
          )}
          {mentionCandidates.users.map((p) => (
            <Flex
              key={p.userId}
              asChild
              w="full"
              px="3"
              py="2"
              align="center"
              justify="space-between"
              layerStyle="interactiveRow"
            >
              <button
                type="button"
                onClick={() =>
                  insertMentionToken(
                    formatUserMentionToken(p.user.fullName, p.userId),
                  )
                }
              >
                <HStack gap="2" minW="0">
                  <AtSign size={14} />
                  <Text textStyle="sm" fontWeight="medium" truncate>
                    {p.user.fullName}
                  </Text>
                </HStack>
                <Text textStyle="xs" color="fg.muted" truncate>
                  {p.user.email}
                </Text>
              </button>
            </Flex>
          ))}
        </Box>
      )}

      <Stack gap="2">
        {/* Pending Attachments Strip */}
        {pendingAttachments.length > 0 && (
          <Stack gap="1.5">
            {pendingAttachments.map((att) => (
              <Box
                key={att.localId}
                px="2.5"
                py="1.5"
                borderWidth="1px"
                borderColor={
                  att.status === 'error' ? 'border.error' : 'border.emphasized'
                }
                bg="bg.subtle"
              >
                <Flex align="center" justify="space-between" gap="2">
                  <Text textStyle="xs" fontWeight="medium" truncate>
                    {att.fileName}
                  </Text>
                  <HStack gap="2" flexShrink={0}>
                    {att.status !== 'ready' && att.status !== 'error' && (
                      <Text textStyle="xs" color="fg.muted">
                        {t('uploadingProgress', { progress: att.progress })}
                      </Text>
                    )}
                    {att.status === 'error' && (
                      <Text textStyle="xs" color="fg.error">
                        {att.errorCode
                          ? resolveErrorCode(
                              tErrors,
                              att.errorCode,
                              t('uploadFailed'),
                            )
                          : t('uploadFailed')}
                      </Text>
                    )}
                    <IconButton
                      type="button"
                      size="2xs"
                      variant="ghost"
                      aria-label={t('removeAttachment')}
                      onClick={() => onRemoveAttachment(att.localId)}
                    >
                      <X size={13} />
                    </IconButton>
                  </HStack>
                </Flex>
                {att.status !== 'ready' && att.status !== 'error' && (
                  <Progress.Root value={att.progress} size="xs" mt="1">
                    <Progress.Track>
                      <Progress.Range />
                    </Progress.Track>
                  </Progress.Root>
                )}
              </Box>
            ))}
          </Stack>
        )}

        {errorCode && (
          <FieldError>
            {resolveErrorCode(tErrors, errorCode, tErrors('unknown'))}
          </FieldError>
        )}

        <Flex gap="2" align="end" w="full" minW="0">
          <FileUpload.Root
            w="auto"
            flexShrink={0}
            maxFiles={MAX_CHAT_ATTACHMENTS_PER_MESSAGE}
            accept={[...ALLOWED_CHAT_ATTACHMENT_MIME_TYPES]}
            disabled={attachDisabled}
            onFileAccept={(details) => {
              if (details.files.length > 0) {
                onStageFiles(details.files);
              }
            }}
          >
            <FileUpload.HiddenInput />
            <FileUpload.Trigger asChild>
              <IconButton
                type="button"
                variant="outline"
                size="sm"
                flexShrink={0}
                disabled={attachDisabled}
                aria-label={t('attachFiles')}
                title={t('attachFiles')}
              >
                <Paperclip size={16} />
              </IconButton>
            </FileUpload.Trigger>
          </FileUpload.Root>

          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) =>
              handleTextChange(
                e.target.value,
                e.target.selectionStart ?? e.target.value.length,
              )
            }
            onSelect={(e) =>
              setCaretPos(
                e.currentTarget.selectionStart ?? e.currentTarget.value.length,
              )
            }
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={t('composerPlaceholder')}
            maxLength={MAX_CHAT_MESSAGE_BODY_LENGTH}
            rows={2}
            resize="none"
            disabled={disabled}
            flex="1"
            minW="0"
          />

          <Button
            type="button"
            size="sm"
            flexShrink={0}
            onClick={() => void handleSubmit()}
            disabled={!canSend}
            loading={isSending}
          >
            <Send size={15} />
            {t('send')}
          </Button>
        </Flex>
      </Stack>
    </Box>
  );
}
