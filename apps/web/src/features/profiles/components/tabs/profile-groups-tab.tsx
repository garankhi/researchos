'use client';

import {
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Link as MuiLink,
  Stack,
  Typography,
} from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import StarIcon from '@mui/icons-material/Star';
import { useTranslations } from 'next-intl';
import NextLink from 'next/link';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { useProfileGroups } from '../../hooks/use-profile-groups';
import type { ResearchGroupResponseDto } from '../../types';

export function ProfileGroupsTab({
  userId,
}: {
  userId?: string;
  isOwner?: boolean;
}) {
  const t = useTranslations('profile');
  const {
    allGroups,
    groupsLed,
    memberOnlyGroups,
    isLoading,
    isFailed,
    refetch,
  } = useProfileGroups({ userId });

  if (isLoading) {
    return (
      <Grid container spacing={2} sx={{ py: 2 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid key={i} size={{ xs: 12, md: 6 }}>
            <LoadingSkeleton variant="rectangular" height={140} />
          </Grid>
        ))}
      </Grid>
    );
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={refetch} />;
  }

  if (allGroups.length === 0) {
    return (
      <EmptyState
        title={t('tabs.groupsEmpty')}
        message={t('tabs.groupsEmptyDesc')}
      />
    );
  }

  const renderGroupCard = (
    group: ResearchGroupResponseDto,
    isLeader: boolean,
  ) => (
    <Grid key={group.id} size={{ xs: 12, md: 6 }}>
      <Card
        variant="outlined"
        sx={{
          height: '100%',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: (theme) => theme.shadows[2],
          },
        }}
      >
        <CardContent
          sx={{ p: 2.5, flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              mb: 1,
            }}
          >
            <Box sx={{ flex: 1, mr: 1 }}>
              <Typography
                variant="subtitle1"
                component="h3"
                sx={{ fontWeight: 600, lineHeight: 1.3 }}
              >
                <MuiLink
                  component={NextLink}
                  href={`/groups/${group.id}`}
                  underline="hover"
                  color="text.primary"
                >
                  {group.name}
                </MuiLink>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {group.code}
              </Typography>
            </Box>

            <Chip
              size="small"
              icon={
                isLeader ? (
                  <StarIcon fontSize="small" />
                ) : (
                  <GroupsIcon fontSize="small" />
                )
              }
              label={isLeader ? t('groups.leader') : t('groups.member')}
              color={isLeader ? 'primary' : 'default'}
              variant={isLeader ? 'filled' : 'outlined'}
            />
          </Stack>

          {group.description ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                lineHeight: 1.5,
              }}
            >
              {group.description}
            </Typography>
          ) : null}
        </CardContent>
      </Card>
    </Grid>
  );

  return (
    <Stack spacing={3} sx={{ py: 1 }}>
      {groupsLed.length > 0 ? (
        <Box>
          <Typography
            variant="h6"
            sx={{ fontSize: '1rem', fontWeight: 600, mb: 1.5 }}
          >
            {t('groups.leadingTitle', { count: groupsLed.length })}
          </Typography>
          <Grid container spacing={2}>
            {groupsLed.map((g) => renderGroupCard(g, true))}
          </Grid>
        </Box>
      ) : null}

      {memberOnlyGroups.length > 0 ? (
        <Box>
          <Typography
            variant="h6"
            sx={{ fontSize: '1rem', fontWeight: 600, mb: 1.5 }}
          >
            {t('groups.memberTitle', { count: memberOnlyGroups.length })}
          </Typography>
          <Grid container spacing={2}>
            {memberOnlyGroups.map((g) => renderGroupCard(g, false))}
          </Grid>
        </Box>
      ) : null}
    </Stack>
  );
}
