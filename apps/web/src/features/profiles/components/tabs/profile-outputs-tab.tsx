'use client';

import {
  Box,
  Card,
  CardContent,
  Chip,
  Link as MuiLink,
  Stack,
  Typography,
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import LaunchIcon from '@mui/icons-material/Launch';
import { useTranslations } from 'next-intl';
import NextLink from 'next/link';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { useProfileOutputs } from '../../hooks/use-profile-outputs';
import type { OutputResponseDto } from '../../types';

export function ProfileOutputsTab({
  userId,
}: {
  userId?: string;
  isOwner?: boolean;
}) {
  const t = useTranslations('profile');
  const { allOutputs, isLoading, isFailed, refetch } = useProfileOutputs({
    userId,
  });

  if (isLoading) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        <LoadingSkeleton variant="rectangular" height={120} count={3} />
      </Stack>
    );
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={refetch} />;
  }

  if (allOutputs.length === 0) {
    return (
      <EmptyState
        title={t('tabs.outputsEmpty')}
        message={t('tabs.outputsEmptyDesc')}
      />
    );
  }

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      {allOutputs.map((output: OutputResponseDto) => {
        const rev = output.currentRevision;
        const title = rev?.title || `Output #${output.id.slice(0, 8)}`;
        const authorsList = output.authors
          ?.sort((a, b) => a.authorOrder - b.authorOrder)
          .map((a) => a.authorNameString)
          .join(', ');
        const venueStr = typeof rev?.venue === 'string' ? rev.venue : null;
        const doiStr = typeof output.doi === 'string' ? output.doi : null;
        const yearStr =
          typeof rev?.publicationYear === 'number' ||
          typeof rev?.publicationYear === 'string'
            ? String(rev.publicationYear)
            : null;

        return (
          <Card key={output.id} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Stack spacing={1}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{
                    justifyContent: 'space-between',
                    alignItems: { xs: 'flex-start', sm: 'flex-start' },
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
                      <MuiLink
                        component={NextLink}
                        href={`/outputs/${output.id}`}
                        underline="hover"
                        color="text.primary"
                      >
                        {title}
                      </MuiLink>
                    </Typography>

                    {authorsList ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {authorsList}
                      </Typography>
                    ) : null}
                  </Box>

                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: { xs: 1, sm: 0 }, flexShrink: 0 }}
                  >
                    {output.visibility ? (
                      <Chip
                        size="small"
                        label={output.visibility}
                        variant="outlined"
                        color="default"
                      />
                    ) : null}
                  </Stack>
                </Stack>

                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                    fontSize: '0.85rem',
                    color: 'text.secondary',
                  }}
                >
                  {venueStr ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontStyle: 'italic' }}
                    >
                      {venueStr}
                    </Typography>
                  ) : null}

                  {yearStr ? (
                    <Typography variant="body2" color="text.secondary">
                      ({yearStr})
                    </Typography>
                  ) : null}

                  {doiStr ? (
                    <MuiLink
                      href={`https://doi.org/${doiStr}`}
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
                      <ArticleIcon fontSize="inherit" />
                      DOI: {doiStr}
                      <LaunchIcon sx={{ fontSize: '0.75rem' }} />
                    </MuiLink>
                  ) : null}
                </Stack>

                {output.topics && output.topics.length > 0 ? (
                  <Stack
                    direction="row"
                    spacing={0.75}
                    sx={{ flexWrap: 'wrap', gap: 0.75, pt: 0.5 }}
                  >
                    {output.topics.map((t) => (
                      <Chip
                        key={t.topicId}
                        label={t.topicName}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                      />
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
