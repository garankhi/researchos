'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link as MuiLink,
  Stack,
  Typography,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import NextLink from 'next/link';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { useMyApplications } from '../../hooks/use-my-applications';
import type { ApplicationResponseDto } from '../../types';

function getStatusChipColor(
  status: string,
): 'warning' | 'success' | 'error' | 'default' {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'ACCEPTED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'WITHDRAWN':
    default:
      return 'default';
  }
}

function formatRemainingTime(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function ProfileApplicationsTab() {
  const t = useTranslations('profile');
  const tApplicationStatus = useTranslations('profile.applicationStatus');
  const tCommon = useTranslations('common');
  const { showSnackbar } = useSnackbar();
  const { applications, isLoading, isFailed, error, refetch, withdraw } =
    useMyApplications();

  const [confirmWithdrawApp, setConfirmWithdrawApp] =
    useState<ApplicationResponseDto | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const handleWithdrawConfirm = async () => {
    if (!confirmWithdrawApp) return;
    try {
      setWithdrawingId(confirmWithdrawApp.id);
      await withdraw(confirmWithdrawApp.id);
      showSnackbar({ message: t('withdrawSuccess'), severity: 'success' });
      setConfirmWithdrawApp(null);
    } catch {
      showSnackbar({ message: t('withdrawError'), severity: 'error' });
    } finally {
      setWithdrawingId(null);
    }
  };

  if (isLoading) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        <LoadingSkeleton variant="rectangular" height={100} count={3} />
      </Stack>
    );
  }

  if (isFailed) {
    return (
      <ErrorState
        title={t('loadError')}
        message={
          (error as { response?: { data?: { message?: string } } })?.response
            ?.data?.message
        }
        onRetry={() => refetch()}
      />
    );
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title={t('tabs.applicationsEmpty')}
        message={t('tabs.applicationsEmptyDesc')}
      />
    );
  }

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      {applications.map((app) => {
        const remaining = formatRemainingTime(app.remainingSeconds);
        const isWithdrawing = withdrawingId === app.id;

        return (
          <Card key={app.id} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{
                  justifyContent: 'space-between',
                  alignItems: { xs: 'flex-start', sm: 'center' },
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="h6"
                    component="h3"
                    sx={{ fontSize: '1.1rem', fontWeight: 600 }}
                  >
                    {app.opportunityTitle ? (
                      <MuiLink
                        component={NextLink}
                        href={`/opportunities/${app.opportunityId}`}
                        underline="hover"
                        color="text.primary"
                      >
                        {app.opportunityTitle}
                      </MuiLink>
                    ) : (
                      `Opportunity #${app.opportunityId.slice(0, 8)}`
                    )}
                  </Typography>

                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{
                      mt: 1,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <Chip
                      size="small"
                      label={tApplicationStatus(app.status)}
                      color={getStatusChipColor(app.status)}
                      variant="outlined"
                    />

                    <Typography variant="caption" color="text.secondary">
                      {t('appliedOn', {
                        date: new Date(app.appliedAt).toLocaleDateString(),
                      })}
                    </Typography>

                    {app.status === 'PENDING' && remaining ? (
                      <Typography variant="caption" color="warning.main">
                        {t('deadlineRemaining', { time: remaining })}
                      </Typography>
                    ) : null}

                    {app.status === 'PENDING' && app.isOverdue ? (
                      <Typography variant="caption" color="error.main">
                        {t('overdue')}
                      </Typography>
                    ) : null}
                  </Stack>

                  {app.applicantNote ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1.5, whiteSpace: 'pre-line' }}
                    >
                      {app.applicantNote}
                    </Typography>
                  ) : null}

                  {app.responseNote ? (
                    <Box
                      sx={{
                        mt: 1.5,
                        p: 1.5,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                      }}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontWeight: 600 }}
                      >
                        {t('responseNote')}:
                      </Typography>
                      <Typography variant="body2">
                        {app.responseNote}
                      </Typography>
                    </Box>
                  ) : null}
                </Box>

                {app.status === 'PENDING' ? (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => setConfirmWithdrawApp(app)}
                    loading={isWithdrawing}
                    sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
                  >
                    {t('withdraw')}
                  </Button>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        );
      })}

      <Dialog
        open={Boolean(confirmWithdrawApp)}
        onClose={() => setConfirmWithdrawApp(null)}
      >
        <DialogTitle>{t('confirmWithdrawTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('confirmWithdrawDesc')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmWithdrawApp(null)} color="inherit">
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleWithdrawConfirm}
            color="error"
            variant="contained"
            autoFocus
          >
            {t('withdraw')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
