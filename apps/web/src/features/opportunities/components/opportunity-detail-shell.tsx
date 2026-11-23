'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Stack,
  Tabs,
  Text,
} from '@chakra-ui/react';
import { LockKeyhole, SearchX } from 'lucide-react';
import { useNow, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { ErrorState, RouteFeedback } from '@/components/ui/feedback';
import { useCurrentUser } from '@/features/identity';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { OpportunityApplications } from './opportunity-applications';
import { OpportunityApplyButton } from './opportunity-apply-button';
import { OpportunityHeader } from './opportunity-header';
import { OpportunityOverview } from './opportunity-overview';
import { OpportunitySidebar } from './opportunity-sidebar';
import { OpportunityDetailSkeleton } from './opportunity-skeletons';
import {
  useOpportunity,
  useOpportunityApplications,
} from '../hooks/use-opportunity';
import { useOpportunityActions } from '../hooks/use-opportunity-actions';
import { useOpportunityGroup } from '../hooks/use-opportunity-group';
import { opportunityPermissions, type OpportunityTab } from '../types';

/**
 * The opportunity's detail screen.
 *
 * The layout follows the profile, group and output detail pages: a
 * full-bleed white banner carrying the title and the tab strip, then a
 * two-column grid on the `#f6f6f6` canvas — the main column on the left,
 * a summary sidebar on the right.
 */
export function OpportunityDetailShell({
  opportunityId,
}: {
  opportunityId?: string;
}) {
  const t = useTranslations('opportunities');
  const common = useTranslations('common');
  const applicationStatus = useTranslations('profile.applicationStatus');
  const now = useNow({ updateInterval: 1000 });
  const viewer = useCurrentUser();
  const { showSnackbar } = useSnackbar();
  const [activeTab, setActiveTab] = useState<OpportunityTab>('overview');

  const {
    opportunity,
    isLoading,
    isFailed,
    isForbidden,
    isNotFound,
    isEmpty,
    refetch,
  } = useOpportunity({ opportunityId, viewerId: viewer?.id });

  const permissions = opportunity
    ? opportunityPermissions(opportunity, viewer)
    : null;

  const group = useOpportunityGroup(opportunity?.groupId);

  const applications = useOpportunityApplications({
    opportunityId,
    enabled: Boolean(permissions?.canSeeApplications),
  });

  const actions = useOpportunityActions({
    opportunityId,
    groupId: opportunity?.groupId,
  });

  if (isLoading) {
    return <OpportunityDetailSkeleton />;
  }

  if (isFailed) {
    return (
      <Box flex="1" bg="home.background">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          py={{ base: '4', md: '8' }}
        >
          <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
            <ErrorState title={t('loadError')} onRetry={() => void refetch()} />
          </Box>
        </Container>
      </Box>
    );
  }

  if (isForbidden) {
    return (
      <RouteFeedback
        icon={<LockKeyhole aria-hidden />}
        title={t('accessDeniedTitle')}
        description={t('accessDeniedMessage')}
        action={
          <Button asChild>
            <NextLink href="/">{common('backToHome')}</NextLink>
          </Button>
        }
      />
    );
  }

  if (isEmpty || isNotFound || !opportunity || !permissions) {
    return (
      <RouteFeedback
        icon={<SearchX aria-hidden />}
        title={t('notFoundTitle')}
        description={t('notFoundMessage')}
        action={
          <Button asChild>
            <NextLink href="/">{common('backToHome')}</NextLink>
          </Button>
        }
      />
    );
  }

  async function handleApply(note: string) {
    await actions.apply(note);
    showSnackbar({ message: t('applySuccess'), severity: 'success' });
  }

  async function handleLifecycle(
    action: () => Promise<unknown>,
    message: string,
  ) {
    try {
      await action();
      showSnackbar({ message, severity: 'success' });
    } catch {
      // The failure is reported by the button's own error state.
    }
  }

  return (
    <Tabs.Root
      as="main"
      flex="1"
      bg="home.background"
      variant="line"
      colorPalette="blue"
      value={activeTab}
      onValueChange={(details) => setActiveTab(details.value as OpportunityTab)}
    >
      {/* Full-bleed white ResearchGate-style opportunity hero banner */}
      <Box bg="bg.panel" borderBottomWidth="1px" borderColor="border">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '5', md: '8' }}
        >
          <Stack gap="5" minW="0">
            <Flex
              direction={{ base: 'column', sm: 'row' }}
              gap="3"
              align={{ base: 'stretch', sm: 'flex-start' }}
              justify="space-between"
            >
              <OpportunityHeader
                opportunity={opportunity}
                groupName={group.groupName}
              />

              <Flex gap="2" align="center" flexShrink={0} wrap="wrap">
                {viewer && opportunity.myApplicationStatus && (
                  <Text role="status">
                    {t('applicationStatus', {
                      status: applicationStatus(
                        opportunity.myApplicationStatus,
                      ),
                    })}
                  </Text>
                )}
                {permissions.canApply &&
                opportunity.applicationDeadline &&
                new Date(opportunity.applicationDeadline) > now ? (
                  <OpportunityApplyButton
                    canApply={permissions.canApply}
                    onApply={handleApply}
                    isBusy={actions.isBusy}
                  />
                ) : null}

                {permissions.canManage ? (
                  <>
                    {opportunity.status === 'DRAFT' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={actions.isBusy}
                        onClick={() =>
                          void handleLifecycle(actions.open, t('openedToast'))
                        }
                      >
                        {t('openForApplications')}
                      </Button>
                    ) : null}
                    {opportunity.status === 'OPEN' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={actions.isBusy}
                        onClick={() =>
                          void handleLifecycle(actions.fill, t('filledToast'))
                        }
                      >
                        {t('markFilled')}
                      </Button>
                    ) : null}
                    {opportunity.status === 'FILLED' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={actions.isBusy}
                        onClick={() =>
                          void handleLifecycle(actions.close, t('closedToast'))
                        }
                      >
                        {t('close')}
                      </Button>
                    ) : null}
                    {opportunity.archivedAt ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        colorPalette="red"
                        loading={actions.isBusy}
                        onClick={() =>
                          void handleLifecycle(
                            actions.archive,
                            t('archivedToast'),
                          )
                        }
                      >
                        {t('archive')}
                      </Button>
                    )}
                  </>
                ) : null}
              </Flex>
            </Flex>

            <Tabs.List
              gap={{ base: '4', md: '7' }}
              borderBottomWidth="0"
              flexWrap="wrap"
            >
              <Tabs.Trigger value="overview" height="12" px="0">
                {t('tabsOverview')}
              </Tabs.Trigger>

              {permissions.canSeeApplications ? (
                <Tabs.Trigger value="applications" height="12" px="0">
                  {t('tabsApplications')}
                  {applications.applications.length > 0 ? (
                    <Badge variant="subtle" colorPalette="gray">
                      {applications.applications.length}
                    </Badge>
                  ) : null}
                </Tabs.Trigger>
              ) : null}
            </Tabs.List>
          </Stack>
        </Container>
      </Box>

      {/* Two-column ResearchGate academic content area on #f6f6f6 canvas */}
      <Container
        maxW="64rem"
        px={{ base: '4', md: '6' }}
        py={{ base: '4', lg: '6' }}
      >
        <Grid
          templateColumns={{
            base: 'minmax(0, 1fr)',
            lg: 'minmax(0, 1.95fr) minmax(0, 1fr)',
          }}
          alignItems="start"
          gap="4"
        >
          <Box minW="0">
            <Tabs.Content value="overview" pt="0">
              <OpportunityOverview opportunity={opportunity} />
            </Tabs.Content>

            {permissions.canSeeApplications ? (
              <Tabs.Content value="applications" pt="0">
                <OpportunityApplications
                  applications={applications.applications}
                  isLoading={applications.isLoading}
                  isFailed={applications.isFailed}
                  onRetry={() => void applications.refetch()}
                />
              </Tabs.Content>
            ) : null}
          </Box>

          <OpportunitySidebar
            opportunity={opportunity}
            groupName={group.groupName}
          />
        </Grid>
      </Container>
    </Tabs.Root>
  );
}
