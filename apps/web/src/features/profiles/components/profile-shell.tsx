'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Card,
  CardContent,
  Container,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import { useTranslations } from 'next-intl';
import { ErrorState, LoadingSkeleton } from '@/components/ui/feedback';
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
    error,
    refetch,
  } = useProfile({ userId, isOwner });

  const { pendingCount } = useOpenAlexCandidates({ enabled: isOwner });

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <LoadingSkeleton variant="rectangular" height={160} />
        <Box sx={{ mt: 3 }}>
          <LoadingSkeleton variant="rectangular" height={48} />
        </Box>
        <Stack spacing={2} sx={{ mt: 3 }}>
          <LoadingSkeleton variant="rectangular" height={120} count={3} />
        </Stack>
      </Container>
    );
  }

  if (isForbidden) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Card
          variant="outlined"
          sx={{ textAlign: 'center', p: 4, borderRadius: 2 }}
        >
          <Stack spacing={2} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <LockOutlinedIcon fontSize="large" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t('unconfirmedTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('unconfirmedDesc')}
            </Typography>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (isNotFound || !profile) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Card
          variant="outlined"
          sx={{ textAlign: 'center', p: 4, borderRadius: 2 }}
        >
          <Stack spacing={2} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <PersonSearchIcon fontSize="large" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t('notFoundTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('notFoundDesc')}
            </Typography>
          </Stack>
        </Card>
      </Container>
    );
  }

  if (isFailed) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <ErrorState
          title={t('loadError')}
          message={
            (error as { response?: { data?: { message?: string } } })?.response
              ?.data?.message
          }
          onRetry={refetch}
        />
      </Container>
    );
  }

  const effectiveUserId = profile.userId;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
      <ProfileHeader
        profile={profile}
        isOwner={isOwner}
        onEdit={isOwner ? () => setEditOpen(true) : undefined}
      />

      {isOwner ? (
        <ProfileEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profile={profile}
        />
      ) : null}

      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {isOwner ? (
              <Tab
                value="applications"
                label={t('tabs.applications')}
                id="profile-tab-applications"
                aria-controls="profile-tabpanel-applications"
              />
            ) : null}

            <Tab
              value="groups"
              label={t('tabs.groups')}
              id="profile-tab-groups"
              aria-controls="profile-tabpanel-groups"
            />

            <Tab
              value="outputs"
              label={t('tabs.outputs')}
              id="profile-tab-outputs"
              aria-controls="profile-tabpanel-outputs"
            />

            <Tab
              value="interests"
              label={t('tabs.interests')}
              id="profile-tab-interests"
              aria-controls="profile-tabpanel-interests"
            />

            {isOwner ? (
              <Tab
                value="openalex"
                label={
                  <Badge
                    badgeContent={pendingCount}
                    color="primary"
                    sx={{ '& .MuiBadge-badge': { right: -12, top: 2 } }}
                  >
                    {t('tabs.openalex')}
                  </Badge>
                }
                id="profile-tab-openalex"
                aria-controls="profile-tabpanel-openalex"
              />
            ) : null}
          </Tabs>
        </Box>

        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {activeTab === 'applications' && isOwner ? (
            <ProfileApplicationsTab />
          ) : null}

          {activeTab === 'groups' ? (
            <ProfileGroupsTab userId={effectiveUserId} isOwner={isOwner} />
          ) : null}

          {activeTab === 'outputs' ? (
            <ProfileOutputsTab userId={effectiveUserId} isOwner={isOwner} />
          ) : null}

          {activeTab === 'interests' ? (
            <ProfileInterestsTab userId={effectiveUserId} isOwner={isOwner} />
          ) : null}

          {activeTab === 'openalex' && isOwner ? <ProfileOpenAlexTab /> : null}
        </CardContent>
      </Card>
    </Container>
  );
}
