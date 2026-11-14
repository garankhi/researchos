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
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { useTaxonomyControllerFindAllTopics } from '@/lib/api';
import type { TopicResponseDto } from '@/lib/api/models';
import { useProfileInterests } from '../../hooks/use-profile-interests';
import type { ProfileInterestResponseDto } from '../../types';

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
      showSnackbar({
        message: t('interestsTab.interestAddError'),
        severity: 'error',
      });
    }
  };

  const handleUpdateStatus = async (
    interest: ProfileInterestResponseDto,
    status: 'ACTIVE' | 'REJECTED',
  ) => {
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
      showSnackbar({ message: t('updateError'), severity: 'error' });
    }
  };

  const handleRemoveInterest = async (interest: ProfileInterestResponseDto) => {
    try {
      await removeInterest(interest.id);
      showSnackbar({
        message: t('interestsTab.interestRemoved'),
        severity: 'success',
      });
    } catch {
      showSnackbar({ message: t('updateError'), severity: 'error' });
    }
  };

  if (isLoading) {
    return (
      <Stack gap="4" py="2">
        <LoadingSkeleton variant="rectangular" height={80} count={3} />
      </Stack>
    );
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={refetch} />;
  }

  const displayInterests = isOwner
    ? interests
    : interests.filter((item) => item.status === 'ACTIVE');

  return (
    <Stack gap="5" py="1">
      {isOwner ? (
        <Flex justify="space-between" align="center" gap="3" flexWrap="wrap">
          <Heading as="h3" size="sm" fontWeight="semibold">
            {t('interestsTab.title')} ({displayInterests.length})
          </Heading>
          <Button size="sm" onClick={() => setOpenAddDialog(true)}>
            <Plus />
            {t('interestsTab.addInterest')}
          </Button>
        </Flex>
      ) : null}

      {displayInterests.length === 0 ? (
        <EmptyState
          title={t('interestsTab.emptyTitle')}
          message={t('interestsTab.emptyMessage')}
        />
      ) : (
        <Stack gap="3">
          {displayInterests.map((interest) => {
            const { field, subfield, topic } = interest.topicPath;
            const fullPath = `${field?.name ?? ''} › ${subfield?.name ?? ''} › ${topic?.name ?? ''}`;

            return (
              <Box
                key={interest.id}
                bg="bg.panel"
                borderWidth="1px"
                borderRadius="lg"
                p="4"
              >
                <Flex
                  direction={{ base: 'column', sm: 'row' }}
                  gap="3"
                  justify="space-between"
                  align={{ base: 'flex-start', sm: 'center' }}
                >
                  <Box flex="1" minW="0">
                    <Text textStyle="sm" fontWeight="semibold">
                      {topic?.name}
                    </Text>
                    <Text textStyle="xs" color="fg.muted">
                      {fullPath}
                    </Text>

                    <Flex mt="2" gap="2" align="center" flexWrap="wrap">
                      <Badge
                        variant="outline"
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

                      {interest.sourceType ? (
                        <Badge variant="outline" colorPalette="gray">
                          {interest.sourceType}
                        </Badge>
                      ) : null}
                    </Flex>
                  </Box>

                  {isOwner ? (
                    <Flex gap="1" align="center">
                      {interest.status === 'SUGGESTED' ? (
                        <>
                          <IconButton
                            size="sm"
                            variant="ghost"
                            colorPalette="green"
                            aria-label={t('interestsTab.acceptInterest')}
                            onClick={() =>
                              handleUpdateStatus(interest, 'ACTIVE')
                            }
                          >
                            <Check />
                          </IconButton>
                          <IconButton
                            size="sm"
                            variant="ghost"
                            colorPalette="red"
                            aria-label={t('interestsTab.rejectInterest')}
                            onClick={() =>
                              handleUpdateStatus(interest, 'REJECTED')
                            }
                          >
                            <X />
                          </IconButton>
                        </>
                      ) : (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          colorPalette="red"
                          aria-label={t('interestsTab.removeInterest')}
                          onClick={() => handleRemoveInterest(interest)}
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
        </Stack>
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
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {t('interestsTab.addInterestDialogTitle')}
                </Dialog.Title>
                <Dialog.Description textStyle="sm" color="fg.muted">
                  {t('interestsTab.addInterestDialogDesc')}
                </Dialog.Description>
              </Dialog.Header>

              <Dialog.Body>
                <Stack gap="3">
                  <Input
                    value={topicSearchInput}
                    onChange={(event) =>
                      setTopicSearchInput(event.target.value)
                    }
                    placeholder={t('interestsTab.selectTopic')}
                    aria-label={t('interestsTab.selectTopic')}
                  />

                  {topicsQuery.isLoading ? (
                    <LoadingSkeleton
                      variant="rectangular"
                      height={80}
                      count={3}
                    />
                  ) : searchedTopics.length === 0 ? (
                    <Text textStyle="sm" color="fg.muted">
                      {t('interestsTab.emptyMessage')}
                    </Text>
                  ) : (
                    <Stack gap="2" maxH="60" overflowY="auto">
                      {searchedTopics.map((topic) => {
                        const isSelected = selectedTopic?.id === topic.id;
                        return (
                          <Button
                            key={topic.id}
                            variant={isSelected ? 'solid' : 'outline'}
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
                  onClick={handleAddInterest}
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
    </Stack>
  );
}
