'use client';

import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  Flex,
  Input,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ChatConversationTypeEnum } from '@researchos/chat';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorState } from '@/components/ui/feedback';
import { apiErrorCode } from '@/lib/api-error';
import type { ChatConversationResponseDto } from '@/lib/api/models';
import { resolveErrorCode } from '@/utils/error-messages';
import {
  useChatConversations,
  useSearchChatPeople,
} from '../hooks/use-chat-conversations';
import type { ChatUserSummary } from '../types';

export function NewConversationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversation: ChatConversationResponseDto) => void;
}) {
  const t = useTranslations('chat');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  const [groupTitle, setGroupTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<ChatUserSummary[]>([]);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);

  const { createConversation } = useChatConversations();
  const { users, isFetching } = useSearchChatPeople(searchQuery, open);

  const resetState = () => {
    setGroupTitle('');
    setSearchQuery('');
    setSelectedUsers([]);
    setSubmitErrorCode(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetState();
    }
    onOpenChange(nextOpen);
  };

  const toggleUser = (user: ChatUserSummary) => {
    setSubmitErrorCode(null);
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0 || createConversation.isPending) return;

    setSubmitErrorCode(null);
    try {
      const created = await createConversation.mutateAsync({
        data: {
          type: ChatConversationTypeEnum.GROUP,
          title: groupTitle.trim() || null,
          participantIds: selectedUsers.map((u) => u.id),
        },
      });
      resetState();
      onOpenChange(false);
      onCreated(created);
    } catch (err) {
      setSubmitErrorCode(apiErrorCode(err) ?? 'server_error');
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => handleClose(details.open)}
    >
      <Portal>
        <Dialog.Backdrop bg="drawerBackdrop" />
        <Dialog.Positioner>
          <Dialog.Content boxShadow="overlayPanel" maxW="lg" w="full">
            <Dialog.Header>
              <Dialog.Title>{t('createGroup')}</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Header>

            <Dialog.Body>
              <Stack gap="4">
                <Stack gap="1">
                  <Text textStyle="sm" fontWeight="medium">
                    {t('groupTitleLabel')}
                  </Text>
                  <Input
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    placeholder={t('groupTitlePlaceholder')}
                    maxLength={120}
                  />
                </Stack>

                <Stack gap="1">
                  <Text textStyle="sm" fontWeight="medium">
                    {t('searchPeopleLabel')}
                  </Text>
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('searchPeoplePlaceholder')}
                  />
                </Stack>

                {selectedUsers.length > 0 && (
                  <Flex gap="1.5" wrap="wrap" align="center">
                    <Text textStyle="xs" color="fg.muted">
                      {t('selectedParticipants', {
                        count: selectedUsers.length,
                      })}
                    </Text>
                    {selectedUsers.map((u) => (
                      <Badge
                        key={u.id}
                        variant="subtle"
                        px="2"
                        py="0.5"
                        cursor="pointer"
                        onClick={() => toggleUser(u)}
                      >
                        {u.fullName} ×
                      </Badge>
                    ))}
                  </Flex>
                )}

                <Box
                  borderWidth="1px"
                  borderColor="border.emphasized"
                  maxH="240px"
                  overflowY="auto"
                >
                  {users.length === 0 ? (
                    <Box p="4" textAlign="center">
                      <Text textStyle="sm" color="fg.muted">
                        {isFetching ? tCommon('loading') : '—'}
                      </Text>
                    </Box>
                  ) : (
                    users.map((user) => {
                      const isSelected = selectedUsers.some(
                        (u) => u.id === user.id,
                      );
                      return (
                        <Flex
                          key={user.id}
                          asChild
                          w="full"
                          textAlign="start"
                          px="3"
                          py="2.5"
                          align="center"
                          justify="space-between"
                          layerStyle="interactiveRow"
                          bg={isSelected ? 'bg.muted' : undefined}
                        >
                          <button
                            type="button"
                            onClick={() => toggleUser(user)}
                          >
                            <Box minW="0">
                              <Text textStyle="sm" fontWeight="medium" truncate>
                                {user.fullName}
                              </Text>
                              <Text textStyle="xs" color="fg.muted" truncate>
                                {user.departmentUnit} · {user.email}
                              </Text>
                            </Box>
                            {isSelected && <Check size={16} />}
                          </button>
                        </Flex>
                      );
                    })
                  )}
                </Box>

                {submitErrorCode && (
                  <ErrorState
                    title={resolveErrorCode(
                      tErrors,
                      submitErrorCode,
                      tErrors('unknown'),
                    )}
                  />
                )}
              </Stack>
            </Dialog.Body>

            <Dialog.Footer>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                loading={createConversation.isPending}
                disabled={selectedUsers.length === 0}
                onClick={() => void handleCreate()}
              >
                {t('createGroup')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
