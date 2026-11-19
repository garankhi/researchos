'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Input,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useTaxonomyControllerFindAllTopics } from '@/lib/api';
import type { TopicResponseDto } from '@/lib/api/models';
import { useProfileInterests } from '../../hooks/use-profile-interests';
import type { ProfileInterestResponseDto } from '../../types';
import { ProfileTabSkeleton, topicOptions } from '../profile-skeletons';

export function ProfileInterestsTab({
  userId,
  isOwner,
}: {
  userId?: string;
  isOwner?: boolean;
}) {
  const t = useTranslations('profile');
  const tInterestStatus = useTranslations('profile.interestStatus');
  const tCommon = useTranslations('common');
  const { showSnackbar } = useSnackbar();

  const {
    interests,
    isLoading,
    isFailed,
    refetch,
    createInterest,
    isCreating,
    updateStatus,
    removeInterest,
  } = useProfileInterests({ userId });

  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [topicSearchInput, setTopicSearchInput] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<TopicResponseDto | null>(
    null,
  );
  const [inlineActionError, setInlineActionError] = useState<string | null>(
    null,
  );

  const topicsQuery = useTaxonomyControllerFindAllTopics(
    {
      search: topicSearchInput.trim() || undefined,
      limit: 20,
    },
    {
      query: {
        enabled: openAddDialog,
        staleTime: 30 * 1000,
      },
    },
  );

  const searchedTopics: TopicResponseDto[] = topicsQuery.data?.items ?? [];

  const handleAddInterest = async () => {
    if (!selectedTopic) return;
    setInlineActionError(null);
    try {
      await createInterest(selectedTopic.id);
      showSnackbar({
        message: t('interestsTab.interestAdded'),
        severity: 'success',
      });
      setOpenAddDialog(false);
      setSelectedTopic(null);
      setTopicSearchInput('');
    } catch {
      setInlineActionError(t('interestsTab.interestAddError'));
    }
  };

  const handleUpdateStatus = async (
    interest: ProfileInterestResponseDto,
    status: 'ACTIVE' | 'REJECTED',
  ) => {
    setInlineActionError(null);
    try {
      await updateStatus(interest.id, status);
      showSnackbar({
        message:
          status === 'ACTIVE'
            ? t('interestsTab.interestAccepted')
            : t('interestsTab.interestRejected'),
        severity: 'success',
      });
    } catch {
      setInlineActionError(t('updateError'));
    }
  };

  const handleRemoveInterest = async (interest: ProfileInterestResponseDto) => {
    setInlineActionError(null);
    try {
      await removeInterest(interest.id);
      showSnackbar({
        message: t('interestsTab.interestRemoved'),
        severity: 'success',
      });
    } catch {
      setInlineActionError(t('updateError'));
    }
  };

  if (isLoading) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ProfileTabSkeleton tab="interests" isOwner={isOwner} />
      </Box>
    );
  }

  if (isFailed) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ErrorState title={t('loadError')} onRetry={refetch} />
      </Box>
    );
  }

  const displayInterests = isOwner
    ? interests
    : interests.filter((item) => item.status === 'ACTIVE');

  return (
    <Box bg="bg.panel" boxShadow="xs">
      <Flex
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
        justify="space-between"
        align="center"
        gap="3"
        flexWrap="wrap"
      >
        <Heading as="h2" size="md" fontWeight="bold">
          {t('interestsTab.title')} ({displayInterests.length})
        </Heading>

        {isOwner ? (
          <Button
            size="xs"
            onClick={() => {
              setInlineActionError(null);
              setOpenAddDialog(true);
            }}
          >
            <Plus />
            {t('interestsTab.addInterest')}
          </Button>
        ) : null}
      </Flex>

      {inlineActionError && !openAddDialog ? (
        <Box px={{ base: '4', md: '6' }} pt="4">
          <ErrorState title={t('updateError')} message={inlineActionError} />
        </Box>
      ) : null}

      {displayInterests.length === 0 ? (
        <Box p={{ base: '4', md: '6' }}>
          <EmptyState
            title={t('interestsTab.emptyTitle')}
            message={t('interestsTab.emptyMessage')}
          />
        </Box>
      ) : (
        <Box>
          {displayInterests.map((interest, idx) => {
            const { field, subfield, topic } = interest.topicPath;
            const hierarchy = [field?.name, subfield?.name]
              .filter(Boolean)
              .join(' › ');

            return (
              <Box
                key={interest.id}
                py="4"
                px={{ base: '4', md: '6' }}
                borderBottomWidth={
                  idx < displayInterests.length - 1 ? '1px' : '0'
                }
                borderColor="border"
              >
                <Flex
                  direction={{ base: 'column', sm: 'row' }}
                  gap="3"
                  justify="space-between"
                  align={{ base: 'flex-start', sm: 'center' }}
                >
                  <Box flex="1" minW="0">
                    <Flex align="center" gap="2" wrap="wrap">
                      <Text textStyle="sm" fontWeight="semibold">
                        {topic?.name}
                      </Text>
                      {isOwner ? (
                        <Badge
                          variant="subtle"
                          colorPalette={
                            interest.status === 'ACTIVE'
                              ? 'green'
                              : interest.status === 'SUGGESTED'
                                ? 'blue'
                                : 'gray'
                          }
                        >
                          {tInterestStatus(interest.status)}
                        </Badge>
                      ) : null}
                    </Flex>

                    {hierarchy ? (
                      <Text textStyle="xs" color="fg.muted" mt="0.5">
                        {hierarchy}
                      </Text>
                    ) : null}
                  </Box>

                  {isOwner ? (
                    <Flex gap="1" align="center" flexShrink={0}>
                      {interest.status === 'SUGGESTED' ? (
                        <>
                          <IconButton
                            size="xs"
                            variant="outline"
                            colorPalette="green"
                            aria-label={t('interestsTab.acceptInterest')}
                            onClick={() =>
                              void handleUpdateStatus(interest, 'ACTIVE')
                            }
                          >
                            <Check />
                          </IconButton>
                          <IconButton
                            size="xs"
                            variant="outline"
                            colorPalette="red"
                            aria-label={t('interestsTab.rejectInterest')}
                            onClick={() =>
                              void handleUpdateStatus(interest, 'REJECTED')
                            }
                          >
                            <X />
                          </IconButton>
                        </>
                      ) : (
                        <IconButton
                          size="xs"
                          variant="ghost"
                          colorPalette="gray"
                          aria-label={t('interestsTab.removeInterest')}
                          onClick={() => void handleRemoveInterest(interest)}
                        >
                          <Trash2 />
                        </IconButton>
                      )}
                    </Flex>
                  ) : null}
                </Flex>
              </Box>
            );
          })}
        </Box>
      )}

      <Dialog.Root
        open={openAddDialog}
        onOpenChange={(details) => {
          if (!details.open) setOpenAddDialog(false);
        }}
        size="lg"
        placement="center"
        motionPreset="scale"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content boxShadow="overlayPanel">
              <Dialog.Header
                flexDirection="column"
                alignItems="flex-start"
                gap="1"
              >
                <Dialog.Title>
                  {t('interestsTab.addInterestDialogTitle')}
                </Dialog.Title>
                <Dialog.Description textStyle="sm" color="fg.muted">
                  {t('interestsTab.addInterestDialogDesc')}
                </Dialog.Description>
              </Dialog.Header>

              <Dialog.Body>
                <Stack gap="3">
                  {inlineActionError && openAddDialog ? (
                    <ErrorState
                      title={t('interestsTab.interestAddError')}
                      message={inlineActionError}
                    />
                  ) : null}

                  <Input
                    value={topicSearchInput}
                    onChange={(event) =>
                      setTopicSearchInput(event.target.value)
                    }
                    placeholder={t('interestsTab.selectTopic')}
                    aria-label={t('interestsTab.selectTopic')}
                  />

                  {topicsQuery.isLoading ? (
                    <DelayedSkeleton layout={topicOptions} />
                  ) : searchedTopics.length === 0 ? (
                    <Text textStyle="sm" color="fg.muted">
                      {t('interestsTab.emptyMessage')}
                    </Text>
                  ) : (
                    <Stack
                      gap="0"
                      maxH="60"
                      overflowY="auto"
                      borderWidth="1px"
                      borderColor="border"
                    >
                      {searchedTopics.map((topic) => {
                        const isSelected = selectedTopic?.id === topic.id;
                        return (
                          <Button
                            key={topic.id}
                            variant={isSelected ? 'solid' : 'ghost'}
                            layerStyle={
                              isSelected ? undefined : 'interactiveRow'
                            }
                            justifyContent="flex-start"
                            onClick={() => setSelectedTopic(topic)}
                          >
                            {topic.name}
                          </Button>
                        );
                      })}
                    </Stack>
                  )}
                </Stack>
              </Dialog.Body>

              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={() => setOpenAddDialog(false)}
                  disabled={isCreating}
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  onClick={() => void handleAddInterest()}
                  disabled={!selectedTopic}
                  loading={isCreating}
                >
                  {tCommon('add')}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger />
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  );
}
