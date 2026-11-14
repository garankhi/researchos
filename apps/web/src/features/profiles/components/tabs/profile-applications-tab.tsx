'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  Heading,
  Link,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useFormatter, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { useMyApplications } from '../../hooks/use-my-applications';
import type { ApplicationResponseDto } from '../../types';

function getStatusPalette(status: string): 'yellow' | 'green' | 'red' | 'gray' {
  switch (status) {
    case 'PENDING':
      return 'yellow';
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
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const { showSnackbar } = useSnackbar();
  const { applications, isLoading, isFailed, refetch, withdraw } =
    useMyApplications();

  const [confirmWithdrawApp, setConfirmWithdrawApp] =
    useState<ApplicationResponseDto | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const handleWithdrawConfirm = async () => {
    if (!confirmWithdrawApp) return;
    try {
      setWithdrawingId(confirmWithdrawApp.id);
      await withdraw(confirmWithdrawApp.id);
      showSnackbar({
        message: t('applicationsTab.withdrawSuccess'),
        severity: 'success',
      });
      setConfirmWithdrawApp(null);
    } catch {
      showSnackbar({
        message: t('applicationsTab.withdrawError'),
        severity: 'error',
      });
    } finally {
      setWithdrawingId(null);
    }
  };

  if (isLoading) {
    return (
      <Stack gap="4" py="2">
        <LoadingSkeleton variant="rectangular" height={100} count={3} />
      </Stack>
    );
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={() => refetch()} />;
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title={t('applicationsTab.emptyTitle')}
        message={t('applicationsTab.emptyMessage')}
      />
    );
  }

  return (
    <Stack gap="4" py="1">
      {applications.map((app) => {
        const remaining = formatRemainingTime(app.remainingSeconds);
        const isWithdrawing = withdrawingId === app.id;

        return (
          <Box
            key={app.id}
            bg="bg.panel"
            borderWidth="1px"
            borderRadius="lg"
            p="5"
          >
            <Flex
              direction={{ base: 'column', sm: 'row' }}
              gap="4"
              justify="space-between"
              align={{ base: 'flex-start', sm: 'center' }}
            >
              <Box flex="1" minW="0">
                <Heading as="h3" size="sm" fontWeight="semibold">
                  {app.opportunityTitle ? (
                    <Link asChild color="fg">
                      <NextLink href={`/opportunities/${app.opportunityId}`}>
                        {app.opportunityTitle}
                      </NextLink>
                    </Link>
                  ) : (
                    `Opportunity #${app.opportunityId.slice(0, 8)}`
                  )}
                </Heading>

                <Flex mt="2" gap="3" align="center" flexWrap="wrap">
                  <Badge
                    variant="outline"
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
                    mt="3"
                    whiteSpace="pre-line"
                  >
                    {app.applicantNote}
                  </Text>
                ) : null}

                {app.responseNote ? (
                  <Box mt="3" p="3" bg="bg.subtle" borderRadius="md">
                    <Text textStyle="xs" color="fg.muted" fontWeight="semibold">
                      {t('applicationsTab.responseNoteLabel')}
                    </Text>
                    <Text textStyle="sm">{app.responseNote}</Text>
                  </Box>
                ) : null}
              </Box>

              {app.status === 'PENDING' ? (
                <Button
                  variant="outline"
                  colorPalette="red"
                  size="sm"
                  onClick={() => setConfirmWithdrawApp(app)}
                  loading={isWithdrawing}
                  alignSelf={{ base: 'flex-start', sm: 'center' }}
                >
                  {t('applicationsTab.withdraw')}
                </Button>
              ) : null}
            </Flex>
          </Box>
        );
      })}

      <Dialog.Root
        open={Boolean(confirmWithdrawApp)}
        onOpenChange={(details) => {
          if (!details.open) setConfirmWithdrawApp(null);
        }}
        placement="center"
        motionPreset="scale"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {t('applicationsTab.confirmWithdrawTitle')}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text textStyle="sm" color="fg.muted">
                  {t('applicationsTab.confirmWithdrawDesc')}
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={() => setConfirmWithdrawApp(null)}
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  colorPalette="red"
                  onClick={handleWithdrawConfirm}
                  loading={withdrawingId !== null}
                >
                  {t('applicationsTab.withdraw')}
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
