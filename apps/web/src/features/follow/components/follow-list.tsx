'use client';

import { Box, Heading, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useFollows } from '../hooks/use-follows';
import { FollowListRow } from './follow-list-row';

/**
 * The caller's followed entities.
 *
 * This is the following list of the profile screen. It reads the same
 * request the follow button reads, so a follow toggled on a detail view
 * shows up here without a reload.
 */
export function FollowList() {
  const t = useTranslations('follow');
  const { items, total, isLoaded, isFailed, refetch } = useFollows();

  if (!isLoaded && isFailed) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ErrorState title={t('list.loadError')} onRetry={() => void refetch()} />
      </Box>
    );
  }

  if (isLoaded && items.length === 0) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <EmptyState
          title={t('list.emptyTitle')}
          message={t('list.emptyMessage')}
        />
      </Box>
    );
  }

  return (
    <Stack gap="4">
      <Box bg="bg.panel" boxShadow="xs">
        <Box
          px={{ base: '4', md: '6' }}
          py="4"
          borderBottomWidth="1px"
          borderColor="border"
        >
          <Heading as="h2" size="md" fontWeight="bold">
            {t('list.title')}
            {total ? ` (${total})` : ''}
          </Heading>
        </Box>

        {items.length === 0 ? (
          <Box p={{ base: '4', md: '6' }}>
            <Text textStyle="sm" color="fg.muted">
              {t('list.loading')}
            </Text>
          </Box>
        ) : (
          <Box>
            {items.map((follow, index) => (
              <Box
                key={`${follow.entityType}:${follow.entityId}`}
                py="4"
                px={{ base: '4', md: '6' }}
                borderBottomWidth={index < items.length - 1 ? '1px' : '0'}
                borderColor="border"
              >
                <FollowListRow follow={follow} />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Stack>
  );
}
