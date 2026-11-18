'use client';

import { useState } from 'react';
import { Box, Button, Flex, Heading } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useProfileOutputs } from '../../hooks/use-profile-outputs';
import type { OutputResponseDto } from '../../types';
import { ProfileOutputItem } from '../profile-output-item';
import { ProfileOutputsSkeleton } from '../profile-skeletons';

type OutputFilter = 'all' | 'published' | 'drafts';

export function ProfileOutputsTab({
  userId,
  isOwner = false,
}: {
  userId?: string;
  isOwner?: boolean;
}) {
  const t = useTranslations('profile');
  const [filter, setFilter] = useState<OutputFilter>('all');
  const { allOutputs, isLoading, isFailed, refetch } = useProfileOutputs({
    userId,
  });

  if (isLoading) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ProfileOutputsSkeleton />
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

  if (allOutputs.length === 0) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <EmptyState
          title={t('outputsTab.emptyTitle')}
          message={t('outputsTab.emptyMessage')}
        />
      </Box>
    );
  }

  const publishedOutputs = allOutputs.filter(
    (item) => item.sharingStatus === 'SHARED',
  );
  const draftOutputs = allOutputs.filter(
    (item) => item.sharingStatus !== 'SHARED',
  );

  const visibleOutputs: OutputResponseDto[] =
    filter === 'published'
      ? publishedOutputs
      : filter === 'drafts'
        ? draftOutputs
        : allOutputs;

  return (
    <Box bg="bg.panel" boxShadow="xs">
      <Flex
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
        align="center"
        justify="space-between"
        gap="3"
        flexWrap="wrap"
      >
        <Heading as="h2" size="md" fontWeight="bold">
          {t('outputsTab.title')} ({allOutputs.length})
        </Heading>

        {isOwner && draftOutputs.length > 0 ? (
          <Flex gap="1.5" wrap="wrap">
            <Button
              size="xs"
              variant={filter === 'all' ? 'solid' : 'outline'}
              onClick={() => setFilter('all')}
            >
              {t('outputsTab.filterAll', { count: allOutputs.length })}
            </Button>
            <Button
              size="xs"
              variant={filter === 'published' ? 'solid' : 'outline'}
              onClick={() => setFilter('published')}
            >
              {t('outputsTab.filterPublished', {
                count: publishedOutputs.length,
              })}
            </Button>
            <Button
              size="xs"
              variant={filter === 'drafts' ? 'solid' : 'outline'}
              onClick={() => setFilter('drafts')}
            >
              {t('outputsTab.filterDrafts', { count: draftOutputs.length })}
            </Button>
          </Flex>
        ) : null}
      </Flex>

      {visibleOutputs.length === 0 ? (
        <Box p={{ base: '4', md: '6' }}>
          <EmptyState
            title={t('outputsTab.emptyTitle')}
            message={t('outputsTab.emptyMessage')}
          />
        </Box>
      ) : (
        <Box>
          {visibleOutputs.map((output, index) => (
            <ProfileOutputItem
              key={output.id}
              output={output}
              showBottomBorder={index < visibleOutputs.length - 1}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
