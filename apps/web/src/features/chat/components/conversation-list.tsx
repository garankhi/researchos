'use client';

import {
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { MessageSquarePlus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { stripMentionIdsForPreview } from '@researchos/chat';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { apiErrorCode } from '@/lib/api-error';
import type { ChatConversationResponseDto } from '@/lib/api/models';
import { resolveErrorCode } from '@/utils/error-messages';
import type { ChatConnectionStatus } from '../types';
import { useSearchChatPeople } from '../hooks/use-chat-conversations';
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
  onSelectPerson,
  openingPersonId,
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
  onSelectPerson: (userId: string) => Promise<boolean>;
  openingPersonId: string | null;
}) {
  const t = useTranslations('chat');
  const tConn = useTranslations('chat.connection');
  const tErrors = useTranslations('errors');
  const format = useFormatter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const term = search.trim();
  const isSearching = term.length > 0;
  const canSearchPeople = term.length >= 2;
  const searchReady = canSearchPeople && term === debouncedSearch;
  const people = useSearchChatPeople(debouncedSearch, searchReady);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(term), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const query = term.toLocaleLowerCase();
  const matchingConversations = isSearching
    ? conversations.filter((conversation) =>
        [
          conversation.title,
          ...conversation.participants
            .filter((participant) => participant.userId !== currentUserId)
            .flatMap(({ user }) => [user.fullName, user.email]),
        ].some((value) => value?.toLocaleLowerCase().includes(query)),
      )
    : conversations;
  const existingDirectUsers = new Set(
    matchingConversations
      .filter((conversation) => conversation.type === 'DIRECT')
      .flatMap((conversation) =>
        conversation.participants.map(({ userId }) => userId),
      ),
  );
  const matchingPeople = searchReady
    ? people.users.filter(
        (person) =>
          person.id !== currentUserId && !existingDirectUsers.has(person.id),
      )
    : [];

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

      <Box px="3" py="3" borderBottomWidth="1px" borderColor="border.subtle">
        <InputGroup
          startElement={<Search size={16} aria-hidden />}
          endElement={
            search && (
              <IconButton
                size="2xs"
                variant="ghost"
                aria-label={t('sidebarSearch.clear')}
                onClick={() => setSearch('')}
              >
                <X size={14} />
              </IconButton>
            )
          }
        >
          <Input
            type="text"
            size="sm"
            maxLength={100}
            value={search}
            aria-label={t('sidebarSearch.label')}
            placeholder={t('sidebarSearch.label')}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearch('');
            }}
          />
        </InputGroup>
      </Box>

      <Box flex="1" minH="0" overflowY="auto">
        {isSearching && (
          <>
            {canSearchPeople && (!searchReady || people.isFetching) && (
              <Text role="status" px="4" py="2" textStyle="xs" color="fg.muted">
                {t('sidebarSearch.loading')}
              </Text>
            )}
            {searchReady && people.isFailed && (
              <Text role="alert" px="4" py="2" textStyle="xs" color="fg.error">
                {t('sidebarSearch.failed')}
              </Text>
            )}
            {matchingPeople.length > 0 && (
              <Stack gap="0">
                <Text
                  as="h2"
                  px="4"
                  pt="3"
                  pb="1"
                  textStyle="xs"
                  fontWeight="semibold"
                  color="fg.muted"
                >
                  {t('sidebarSearch.people')}
                </Text>
                {matchingPeople.map((person) => (
                  <Button
                    key={person.id}
                    type="button"
                    variant="plain"
                    layerStyle="interactiveRow"
                    justifyContent="start"
                    px="3.5"
                    py="2"
                    h="auto"
                    w="full"
                    minW="0"
                    disabled={
                      openingPersonId !== null && openingPersonId !== person.id
                    }
                    loading={openingPersonId === person.id}
                    onClick={() => {
                      void onSelectPerson(person.id).then((opened) => {
                        if (opened)
                          setSearch((current) =>
                            current === search ? '' : current,
                          );
                      });
                    }}
                  >
                    <Avatar.Root size="sm" flexShrink={0}>
                      <Avatar.Fallback name={person.fullName}>
                        {initialsForChatName(person.fullName)}
                      </Avatar.Fallback>
                    </Avatar.Root>
                    <Box textAlign="start" minW="0">
                      <Text textStyle="sm" truncate>
                        {person.fullName}
                      </Text>
                      <Text textStyle="xs" color="fg.muted" truncate>
                        {person.departmentUnit || person.email}
                      </Text>
                    </Box>
                  </Button>
                ))}
              </Stack>
            )}
          </>
        )}
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
        ) : matchingConversations.length === 0 && isSearching ? (
          matchingPeople.length === 0 &&
          (!canSearchPeople ||
            (searchReady && !people.isFetching && !people.isFailed)) && (
            <Text px="4" py="3" role="status" textStyle="sm" color="fg.muted">
              {t(
                canSearchPeople
                  ? 'sidebarSearch.noResults'
                  : 'sidebarSearch.minLength',
              )}
            </Text>
          )
        ) : matchingConversations.length === 0 ? (
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
            {isSearching && (
              <Text
                as="h2"
                px="4"
                pt="3"
                pb="1"
                textStyle="xs"
                fontWeight="semibold"
                color="fg.muted"
              >
                {t('sidebarSearch.conversations')}
              </Text>
            )}
            {matchingConversations.map((conv) => {
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
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => {
                      setSearch('');
                      onSelectConversation(conv.id);
                    }}
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
