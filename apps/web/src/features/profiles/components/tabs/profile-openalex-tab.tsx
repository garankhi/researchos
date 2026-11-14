'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link as MuiLink,
  Stack,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LaunchIcon from '@mui/icons-material/Launch';
import SchoolIcon from '@mui/icons-material/School';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { useOpenAlexCandidates } from '../../hooks/use-openalex-candidates';
import type { CandidateWorkDto } from '../../types';

export function ProfileOpenAlexTab() {
  const t = useTranslations('profile');
  const { showSnackbar } = useSnackbar();

  const {
    candidates,
    pendingCount,
    isLoading,
    isFailed,
    refetch,
    acceptWork,
    rejectWork,
  } = useOpenAlexCandidates();

  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<
    'accept' | 'reject' | null
  >(null);

  const handleAccept = async (work: CandidateWorkDto) => {
    try {
      setOperatingId(work.id);
      setOperationType('accept');
      await acceptWork(work.id);
      showSnackbar({ message: t('candidateAccepted'), severity: 'success' });
    } catch {
      showSnackbar({ message: t('updateError'), severity: 'error' });
    } finally {
      setOperatingId(null);
      setOperationType(null);
    }
  };

  const handleReject = async (work: CandidateWorkDto) => {
    try {
      setOperatingId(work.id);
      setOperationType('reject');
      await rejectWork(work.id);
      showSnackbar({ message: t('candidateRejected'), severity: 'info' });
    } catch {
      showSnackbar({ message: t('updateError'), severity: 'error' });
    } finally {
      setOperatingId(null);
      setOperationType(null);
    }
  };

  if (isLoading) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        <LoadingSkeleton variant="rectangular" height={130} count={3} />
      </Stack>
    );
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={refetch} />;
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        title={t('tabs.openalexEmpty')}
        message={t('tabs.openalexEmptyDesc')}
      />
    );
  }

  return (
    <Stack spacing={2.5} sx={{ py: 1 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {t('openalexQueueTitle')} ({pendingCount})
        </Typography>
      </Stack>

      <Stack spacing={2}>
        {candidates.map((work) => {
          const isCurrentOperating = operatingId === work.id;
          const isAccepting = isCurrentOperating && operationType === 'accept';
          const isRejecting = isCurrentOperating && operationType === 'reject';
          const authorsStr = work.authors?.join(', ');

          return (
            <Card key={work.id} variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', md: 'center' },
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="h6"
                      component="h3"
                      sx={{
                        fontSize: '1.05rem',
                        fontWeight: 600,
                        lineHeight: 1.4,
                      }}
                    >
                      {work.title}
                    </Typography>

                    {authorsStr ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {authorsStr}
                      </Typography>
                    ) : null}

                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{
                        mt: 1,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 1,
                        fontSize: '0.85rem',
                        color: 'text.secondary',
                      }}
                    >
                      {work.venue ? (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ fontStyle: 'italic' }}
                        >
                          {work.venue}
                        </Typography>
                      ) : null}

                      {work.publicationYear ? (
                        <Typography variant="body2" color="text.secondary">
                          ({work.publicationYear})
                        </Typography>
                      ) : null}

                      {work.outputType ? (
                        <Chip
                          size="small"
                          label={work.outputType}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      ) : null}

                      {work.doi ? (
                        <MuiLink
                          href={`https://doi.org/${work.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            fontSize: '0.8125rem',
                          }}
                        >
                          DOI: {work.doi}
                          <LaunchIcon sx={{ fontSize: '0.75rem' }} />
                        </MuiLink>
                      ) : null}

                      {work.openalexId ? (
                        <MuiLink
                          href={work.openalexId}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            fontSize: '0.8125rem',
                          }}
                        >
                          <SchoolIcon fontSize="inherit" />
                          OpenAlex
                          <LaunchIcon sx={{ fontSize: '0.75rem' }} />
                        </MuiLink>
                      ) : null}
                    </Stack>

                    {work.abstract ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 1.5,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: 1.5,
                        }}
                      >
                        {work.abstract}
                      </Typography>
                    ) : null}
                  </Box>

                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{
                      alignSelf: { xs: 'stretch', md: 'center' },
                      justifyContent: { xs: 'flex-end', md: 'flex-start' },
                    }}
                  >
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<CloseIcon />}
                      onClick={() => handleReject(work)}
                      disabled={isCurrentOperating}
                      loading={isRejecting}
                    >
                      {t('rejectWork')}
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<CheckIcon />}
                      onClick={() => handleAccept(work)}
                      disabled={isCurrentOperating}
                      loading={isAccepting}
                    >
                      {t('acceptWork')}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}
