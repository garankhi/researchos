'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useFormatter, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useMyApplications } from '../../hooks/use-my-applications';
import type { ApplicationResponseDto } from '../../types';
import { ProfileTabSkeleton } from '../profile-skeletons';

function getStatusPalette(status: string): 'blue' | 'green' | 'red' | 'gray' {
  switch (status) {
    case 'PENDING':
      return 'blue';
    case 'ACCEPTED':
    case 'INVITED_TO_DISCUSS':
      return 'green';
    case 'DECLINED':
    case 'REJECTED':
      return 'red';
    case 'WITHDRAWN':
    default:
      return 'gray';
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
  const format = useFormatter();
  const { showSnackbar } = useSnackbar();
  const { applications, isLoading, isFailed, refetch, withdraw } =
    useMyApplications();

  const [confirmWithdrawApp, setConfirmWithdrawApp] =
    useState<ApplicationResponseDto | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const handleWithdrawConfirm = async () => {
    if (!confirmWithdrawApp) return;
    setWithdrawError(null);
    try {
      setWithdrawingId(confirmWithdrawApp.id);
      await withdraw(confirmWithdrawApp.id);
      showSnackbar({
        message: t('applicationsTab.withdrawSuccess'),
        severity: 'success',
      });
      setConfirmWithdrawApp(null);
    } catch {
      setWithdrawError(t('applicationsTab.withdrawError'));
    } finally {
      setWithdrawingId(null);
    }
  };

  if (isLoading) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ProfileTabSkeleton tab="applications" />
      </Box>
    );
  }

  if (isFailed) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ErrorState title={t('loadError')} onRetry={() => refetch()} />
      </Box>
    );
  }

  if (applications.length === 0) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <EmptyState
          title={t('applicationsTab.emptyTitle')}
          message={t('applicationsTab.emptyMessage')}
        />
      </Box>
    );
  }

  return (
    <Box bg="bg.panel" boxShadow="xs">
      <Box
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <Heading as="h2" size="md" fontWeight="bold">
          {t('applicationsTab.title')} ({applications.length})
        </Heading>
      </Box>

      <Box>
        {applications.map((app, idx) => {
          const remaining = formatRemainingTime(app.remainingSeconds);
          const isWithdrawing = withdrawingId === app.id;

          return (
            <Box
              key={app.id}
              py="4"
              px={{ base: '4', md: '6' }}
              borderBottomWidth={idx < applications.length - 1 ? '1px' : '0'}
              borderColor="border"
            >
              <Flex
                direction={{ base: 'column', sm: 'row' }}
                gap="4"
                justify="space-between"
                align={{ base: 'flex-start', sm: 'flex-start' }}
              >
                <Stack gap="2" flex="1" minW="0">
                  <Heading as="h3" size="sm" fontWeight="bold">
                    {app.opportunityTitle ? (
                      <Link asChild layerStyle="researchTextLink">
                        <NextLink href={`/opportunities/${app.opportunityId}`}>
                          {app.opportunityTitle}
                        </NextLink>
                      </Link>
                    ) : (
                      `Opportunity #${app.opportunityId.slice(0, 8)}`
                    )}
                  </Heading>

                  <Flex gap="2.5" align="center" flexWrap="wrap">
                    <Badge
                      variant="subtle"
                      colorPalette={getStatusPalette(app.status)}
                    >
                      {tApplicationStatus(app.status)}
                    </Badge>

                    <Text textStyle="xs" color="fg.muted">
                      {t('applicationsTab.appliedOn', {
                        date: format.dateTime(new Date(app.appliedAt), {
                          dateStyle: 'medium',
                        }),
                      })}
                    </Text>

                    {app.status === 'PENDING' && remaining ? (
                      <Text textStyle="xs" color="fg.warning">
                        {t('applicationsTab.remaining', { time: remaining })}
                      </Text>
                    ) : null}

                    {app.status === 'PENDING' && app.isOverdue ? (
                      <Text textStyle="xs" color="fg.error">
                        {t('applicationsTab.countdownOverdue')}
                      </Text>
                    ) : null}
                  </Flex>

                  {app.applicantNote ? (
                    <Text
                      textStyle="sm"
                      color="fg.muted"
                      whiteSpace="pre-line"
                      lineHeight="1.55"
                    >
                      {app.applicantNote}
                    </Text>
                  ) : null}

                  {app.responseNote ? (
                    <Box
                      p="3"
                      bg="bg.muted"
                      borderLeftWidth="2px"
                      borderColor="blue.solid"
                    >
                      <Text
                        textStyle="xs"
                        color="fg.muted"
                        fontWeight="semibold"
                      >
                        {t('applicationsTab.responseNoteLabel')}
                      </Text>
                      <Text textStyle="sm" mt="0.5">
                        {app.responseNote}
                      </Text>
                    </Box>
                  ) : null}
                </Stack>

                {app.status === 'PENDING' ? (
                  <Button
                    variant="outline"
                    colorPalette="red"
                    size="xs"
                    onClick={() => {
                      setWithdrawError(null);
                      setConfirmWithdrawApp(app);
                    }}
                    loading={isWithdrawing}
                    flexShrink={0}
                  >
                    {t('applicationsTab.withdraw')}
                  </Button>
                ) : null}
              </Flex>
            </Box>
          );
        })}
      </Box>

      <ConfirmationModal
        open={Boolean(confirmWithdrawApp)}
        onClose={() => setConfirmWithdrawApp(null)}
        title={t('applicationsTab.confirmWithdrawTitle')}
        body={
          <>
            {withdrawError ? (
              <ErrorState
                title={t('applicationsTab.withdrawError')}
                message={withdrawError}
              />
            ) : null}
            <Text textStyle="sm" color="fg.muted">
              {t('applicationsTab.confirmWithdrawDesc')}
            </Text>
          </>
        }
        confirmLabel={t('applicationsTab.withdraw')}
        isConfirming={withdrawingId !== null}
        onConfirm={() => void handleWithdrawConfirm()}
      />
    </Box>
  );
}
