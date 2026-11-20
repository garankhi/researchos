'use client';

import { useState } from 'react';
import { Badge, Box, Button, Container, Grid, Tabs } from '@chakra-ui/react';
import { LockKeyhole, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  EmptyState,
  ErrorState,
  RouteFeedback,
} from '@/components/ui/feedback';
import NextLink from '@/components/ui/link';
import { FollowList } from '@/features/follow';
import { useOpenAlexCandidates } from '../hooks/use-openalex-candidates';
import { useProfile } from '../hooks/use-profile';
import { useProfileGroups } from '../hooks/use-profile-groups';
import { useProfileInterests } from '../hooks/use-profile-interests';
import { useProfileOutputs } from '../hooks/use-profile-outputs';
import type { ProfileTab, PublicProfileTab } from '../types';
import { ProfileEditDialog } from './profile-edit-dialog';
import { ProfileHeader } from './profile-header';
import { ProfileSidebar } from './profile-sidebar';
import { ProfileHeaderSkeleton, ProfileTabSkeleton } from './profile-skeletons';
import { ProfileApplicationsTab } from './tabs/profile-applications-tab';
import { ProfileGroupsTab } from './tabs/profile-groups-tab';
import { ProfileInterestsTab } from './tabs/profile-interests-tab';
import { ProfileOpenAlexTab } from './tabs/profile-openalex-tab';
import { ProfileOutputsTab } from './tabs/profile-outputs-tab';
import { ProfileOverviewTab } from './tabs/profile-overview-tab';

export function ProfileShell({
  userId,
  isOwner = false,
}: {
  userId?: string;
  isOwner?: boolean;
}) {
  const t = useTranslations('profile');
  const common = useTranslations('common');
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab | PublicProfileTab>(
    'overview',
  );

  const {
    profile,
    isLoading,
    isFailed,
    isForbidden,
    isNotFound,
    isEmpty,
    refetch,
  } = useProfile({ userId, isOwner });

  const effectiveUserId = profile?.userId ?? userId;
  const hasProfileReady = Boolean(profile && effectiveUserId);

  const outputsQuery = useProfileOutputs({
    userId: effectiveUserId,
    enabled: hasProfileReady,
  });
  const groupsQuery = useProfileGroups({
    userId: effectiveUserId,
  });
  const interestsQuery = useProfileInterests({
    userId: effectiveUserId,
  });
  const { pendingCount } = useOpenAlexCandidates({ enabled: isOwner });

  const activeInterests = interestsQuery.interests.filter(
    (item) => item.status === 'ACTIVE',
  );
  const ledGroupIds = new Set(groupsQuery.groupsLed.map((g) => g.id));

  if (isForbidden) {
    return (
      <RouteFeedback
        icon={<LockKeyhole aria-hidden />}
        title={t('profileAccessDenied')}
        description={t('unauthenticatedNotice')}
        action={
          <Button asChild>
            <NextLink href="/">{common('backToHome')}</NextLink>
          </Button>
        }
      />
    );
  }

  if (isNotFound) {
    return (
      <RouteFeedback
        icon={<SearchX aria-hidden />}
        title={t('profileNotFound')}
        description={t('profileEmptyDesc')}
        action={
          <Button asChild>
            <NextLink href="/">{common('backToHome')}</NextLink>
          </Button>
        }
      />
    );
  }

  const renderMainContent = () => {
    if (isLoading) {
      return (
        <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
          <ProfileTabSkeleton tab={activeTab} isOwner={isOwner} />
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

    if (isEmpty) {
      return (
        <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
          <EmptyState
            title={t('profileEmpty')}
            message={t('profileEmptyDesc')}
          />
        </Box>
      );
    }

    if (!profile) {
      return null;
    }

    return (
      <>
        <Tabs.Content value="overview" pt="0">
          <ProfileOverviewTab
            profile={profile}
            isOwner={isOwner}
            outputs={outputsQuery.allOutputs}
            outputsLoading={outputsQuery.isLoading}
            activeInterests={activeInterests}
            onEditProfile={isOwner ? () => setEditOpen(true) : undefined}
            onSelectTab={(nextTab) => setActiveTab(nextTab)}
          />
        </Tabs.Content>

        <Tabs.Content value="outputs" pt="0">
          <ProfileOutputsTab userId={effectiveUserId} isOwner={isOwner} />
        </Tabs.Content>

        <Tabs.Content value="groups" pt="0">
          <ProfileGroupsTab userId={effectiveUserId} isOwner={isOwner} />
        </Tabs.Content>

        <Tabs.Content value="interests" pt="0">
          <ProfileInterestsTab userId={effectiveUserId} isOwner={isOwner} />
        </Tabs.Content>

        {isOwner ? (
          <Tabs.Content value="following" pt="0">
            <FollowList />
          </Tabs.Content>
        ) : null}

        {isOwner ? (
          <Tabs.Content value="applications" pt="0">
            <ProfileApplicationsTab />
          </Tabs.Content>
        ) : null}

        {isOwner ? (
          <Tabs.Content value="openalex" pt="0">
            <ProfileOpenAlexTab />
          </Tabs.Content>
        ) : null}
      </>
    );
  };

  return (
    <Tabs.Root
      as="main"
      flex="1"
      bg="home.background"
      variant="line"
      colorPalette="blue"
      value={activeTab}
      onValueChange={(details) =>
        setActiveTab(details.value as ProfileTab | PublicProfileTab)
      }
    >
      {/* Full-bleed white ResearchGate-style profile hero banner */}
      <Box bg="bg.panel" borderBottomWidth="1px" borderColor="border">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '5', md: '8' }}
        >
          {(profile || isLoading) && (
            <Box pb={{ base: '4', md: '6' }}>
              {profile ? (
                <ProfileHeader
                  profile={profile}
                  isOwner={isOwner}
                  onEdit={isOwner ? () => setEditOpen(true) : undefined}
                />
              ) : (
                <ProfileHeaderSkeleton announce={false} />
              )}
            </Box>
          )}

          <Tabs.List
            gap={{ base: '4', md: '7' }}
            borderBottomWidth="0"
            flexWrap="wrap"
          >
            <Tabs.Trigger value="overview" height="12" px="0">
              {t('tabs.overview')}
            </Tabs.Trigger>

            <Tabs.Trigger value="outputs" height="12" px="0">
              {t('tabs.outputs')}
              {profile && outputsQuery.allOutputs.length > 0 ? (
                <Badge variant="subtle" colorPalette="gray">
                  {outputsQuery.allOutputs.length}
                </Badge>
              ) : null}
            </Tabs.Trigger>

            <Tabs.Trigger value="groups" height="12" px="0">
              {t('tabs.groups')}
              {profile && groupsQuery.allGroups.length > 0 ? (
                <Badge variant="subtle" colorPalette="gray">
                  {groupsQuery.allGroups.length}
                </Badge>
              ) : null}
            </Tabs.Trigger>

            <Tabs.Trigger value="interests" height="12" px="0">
              {t('tabs.interests')}
            </Tabs.Trigger>

            {isOwner ? (
              <Tabs.Trigger value="following" height="12" px="0">
                {t('tabs.following')}
              </Tabs.Trigger>
            ) : null}

            {isOwner ? (
              <Tabs.Trigger value="applications" height="12" px="0">
                {t('tabs.applications')}
              </Tabs.Trigger>
            ) : null}

            {isOwner ? (
              <Tabs.Trigger value="openalex" height="12" px="0">
                {t('tabs.openalex')}
                {pendingCount > 0 ? (
                  <Badge colorPalette="blue">{pendingCount}</Badge>
                ) : null}
              </Tabs.Trigger>
            ) : null}
          </Tabs.List>
        </Container>
      </Box>

      {isOwner && profile ? (
        <ProfileEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profile={profile}
        />
      ) : null}

      {/* Two-column ResearchGate academic workspace on #f6f6f6 canvas */}
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
          <Box minW="0">{renderMainContent()}</Box>

          {profile ? (
            <ProfileSidebar
              profile={profile}
              isOwner={isOwner}
              outputs={outputsQuery.allOutputs}
              groups={groupsQuery.allGroups}
              ledGroupIds={ledGroupIds}
              activeInterests={activeInterests}
              pendingOpenAlexCount={pendingCount}
              onSelectTab={(nextTab) => setActiveTab(nextTab)}
            />
          ) : null}
        </Grid>
      </Container>
    </Tabs.Root>
  );
}
