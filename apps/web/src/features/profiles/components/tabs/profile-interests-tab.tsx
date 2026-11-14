'use client';

import { useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
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

  // Add Interest Dialog State
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [topicSearchInput, setTopicSearchInput] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<TopicResponseDto | null>(
    null,
  );

  // Taxonomy topics query for Autocomplete
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
      showSnackbar({ message: t('interestAdded'), severity: 'success' });
      setOpenAddDialog(false);
      setSelectedTopic(null);
      setTopicSearchInput('');
    } catch {
      showSnackbar({ message: t('interestAddError'), severity: 'error' });
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
          status === 'ACTIVE' ? t('interestAccepted') : t('interestRejected'),
        severity: 'success',
      });
    } catch {
      showSnackbar({ message: t('updateError'), severity: 'error' });
    }
  };

  const handleRemoveInterest = async (interest: ProfileInterestResponseDto) => {
    try {
      await removeInterest(interest.id);
      showSnackbar({ message: t('interestRemoved'), severity: 'success' });
    } catch {
      showSnackbar({ message: t('updateError'), severity: 'error' });
    }
  };

  if (isLoading) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        <LoadingSkeleton variant="rectangular" height={80} count={3} />
      </Stack>
    );
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={refetch} />;
  }

  // Filter out REJECTED interests for non-owners
  const displayInterests = isOwner
    ? interests
    : interests.filter((item) => item.status === 'ACTIVE');

  return (
    <Stack spacing={2.5} sx={{ py: 1 }}>
      {isOwner ? (
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t('interestsTitle')} ({displayInterests.length})
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setOpenAddDialog(true)}
          >
            {t('addInterest')}
          </Button>
        </Stack>
      ) : null}

      {displayInterests.length === 0 ? (
        <EmptyState
          title={t('tabs.interestsEmpty')}
          message={t('tabs.interestsEmptyDesc')}
        />
      ) : (
        <Stack spacing={1.5}>
          {displayInterests.map((interest) => {
            const { field, subfield, topic } = interest.topicPath;
            const fullPath = `${field?.name ?? ''} › ${subfield?.name ?? ''} › ${topic?.name ?? ''}`;

            return (
              <Card
                key={interest.id}
                variant="outlined"
                sx={{ borderRadius: 2 }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    sx={{
                      justifyContent: 'space-between',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 600, color: 'text.primary' }}
                      >
                        {topic?.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fullPath}
                      </Typography>

                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          mt: 0.75,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 0.5,
                        }}
                      >
                        <Chip
                          size="small"
                          label={tInterestStatus(interest.status)}
                          color={
                            interest.status === 'ACTIVE'
                              ? 'success'
                              : interest.status === 'SUGGESTED'
                                ? 'info'
                                : 'default'
                          }
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.75rem' }}
                        />

                        {interest.sourceType ? (
                          <Chip
                            size="small"
                            label={interest.sourceType}
                            variant="outlined"
                            sx={{ height: 22, fontSize: '0.75rem' }}
                          />
                        ) : null}
                      </Stack>
                    </Box>

                    {isOwner ? (
                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}
                      >
                        {interest.status === 'SUGGESTED' ? (
                          <>
                            <Tooltip title={t('acceptInterest')}>
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() =>
                                  handleUpdateStatus(interest, 'ACTIVE')
                                }
                              >
                                <CheckIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('rejectInterest')}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() =>
                                  handleUpdateStatus(interest, 'REJECTED')
                                }
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : (
                          <Tooltip title={t('removeInterest')}>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveInterest(interest)}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Add Interest Taxonomy Dialog */}
      <Dialog
        open={openAddDialog}
        onClose={() => setOpenAddDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('addInterest')}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('addInterestDesc')}
            </Typography>

            <Autocomplete
              options={searchedTopics}
              getOptionLabel={(option) => option.name}
              value={selectedTopic}
              onChange={(_, value) => setSelectedTopic(value)}
              inputValue={topicSearchInput}
              onInputChange={(_, value) => setTopicSearchInput(value)}
              loading={topicsQuery.isLoading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('searchTopicPlaceholder')}
                  fullWidth
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenAddDialog(false)} color="inherit">
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleAddInterest}
            variant="contained"
            disabled={!selectedTopic || isCreating}
            loading={isCreating}
          >
            {tCommon('add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
