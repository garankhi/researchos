'use client';

import { useState } from 'react';
import { Badge, Box, Button, Container, Stack, Tabs } from '@chakra-ui/react';
import { LockKeyhole, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  RouteFeedback,
} from '@/components/ui/feedback';
import { useOpenAlexCandidates } from '../hooks/use-openalex-candidates';
import { useProfile } from '../hooks/use-profile';
import type { ProfileTab, PublicProfileTab } from '../types';
import { ProfileHeader } from './profile-header';
import { ProfileEditDialog } from './profile-edit-dialog';
import { ProfileApplicationsTab } from './tabs/profile-applications-tab';
import { ProfileGroupsTab } from './tabs/profile-groups-tab';
import { ProfileOutputsTab } from './tabs/profile-outputs-tab';
import { ProfileInterestsTab } from './tabs/profile-interests-tab';
import { ProfileOpenAlexTab } from './tabs/profile-openalex-tab';

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
    isOwner ? 'applications' : 'groups',
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

  const { pendingCount } = useOpenAlexCandidates({ enabled: isOwner });

  /*
   * The page never gives up its layout.
   *
   * A signed-in reader came here for a profile and a set of tabs, so the
   * shell — the header, the tab list and the content area — is always
   * rendered. What changes with the state of the request is the *content*
   * inside that shell, never the shell itself.
   *
   * The states are kept apart on purpose:
   *
   * - **loading** — the request is in flight, so there is nothing to say
   *   yet; the content area shows a skeleton;
   * - **failed** — the request never produced an answer, so the content
   *   area shows an error with a retry. It says nothing about the
   *   researcher;
   * - **forbidden** — the answer came back and refused access;
   * - **empty** — the answer came back and said there is no profile yet;
   * - **not found** — the answer came back and said there is no such
   *   researcher.
   *
   * A failure is deliberately not rendered as "not found": the two mean
   * opposite things to the reader, and collapsing them would make a
   * transient API error look like a fact about the person.
   */
  const effectiveUserId = profile?.userId ?? userId;

  const renderContent = () => {
    if (isLoading) {
      return (
        <Stack gap="4">
          <LoadingSkeleton variant="rectangular" height={120} count={2} />
        </Stack>
      );
    }

    if (isFailed) {
      return <ErrorState title={t('loadError')} onRetry={refetch} />;
    }

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

    if (isEmpty) {
      return (
        <EmptyState title={t('profileEmpty')} message={t('profileEmptyDesc')} />
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

    if (!profile) {
      return null;
    }

    /*
     * The tabs. A tab whose content cannot be fetched renders its own
     * error or empty state, so switching tabs always lands on something.
     */
    return (
      <>
        {isOwner ? (
          <Tabs.Content value="applications">
            <ProfileApplicationsTab />
          </Tabs.Content>
        ) : null}

        <Tabs.Content value="groups">
          <ProfileGroupsTab userId={effectiveUserId} isOwner={isOwner} />
        </Tabs.Content>

        <Tabs.Content value="outputs">
          <ProfileOutputsTab userId={effectiveUserId} isOwner={isOwner} />
        </Tabs.Content>

        <Tabs.Content value="interests">
          <ProfileInterestsTab userId={effectiveUserId} isOwner={isOwner} />
        </Tabs.Content>

        {isOwner ? (
          <Tabs.Content value="openalex">
            <ProfileOpenAlexTab />
          </Tabs.Content>
        ) : null}
      </>
    );
  };

  return (
    <Container maxW="6xl" py={{ base: '4', md: '8' }}>
      <ProfileHeader
        profile={profile}
        isOwner={isOwner}
        onEdit={isOwner && profile ? () => setEditOpen(true) : undefined}
      />

      {isOwner && profile ? (
        <ProfileEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profile={profile}
        />
      ) : null}

      <Box bg="bg.panel" borderWidth="1px" borderRadius="lg" overflow="hidden">
        <Tabs.Root
          value={activeTab}
          onValueChange={(details) =>
            setActiveTab(details.value as ProfileTab | PublicProfileTab)
          }
          variant="line"
        >
          <Tabs.List px={{ base: '2', sm: '4' }} overflowX="auto">
            {isOwner ? (
              <Tabs.Trigger value="applications">
                {t('tabs.applications')}
              </Tabs.Trigger>
            ) : null}

            <Tabs.Trigger value="groups">{t('tabs.groups')}</Tabs.Trigger>

            <Tabs.Trigger value="outputs">{t('tabs.outputs')}</Tabs.Trigger>

            <Tabs.Trigger value="interests">{t('tabs.interests')}</Tabs.Trigger>

            {isOwner ? (
              <Tabs.Trigger value="openalex">
                <Badge colorPalette="blue" variant="surface">
                  {t('tabs.openalex')}
                  {pendingCount > 0 ? ` (${pendingCount})` : ''}
                </Badge>
              </Tabs.Trigger>
            ) : null}
          </Tabs.List>

          <Box p={{ base: '4', sm: '6' }}>{renderContent()}</Box>
        </Tabs.Root>
      </Box>
    </Container>
  );
}
