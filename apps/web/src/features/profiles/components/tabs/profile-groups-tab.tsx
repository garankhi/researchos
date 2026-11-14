'use client';

import {
  Badge,
  Box,
  Heading,
  Link,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Star, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
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
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="4" py="2">
        {[1, 2, 3, 4].map((i) => (
          <LoadingSkeleton key={i} variant="rectangular" height={140} />
        ))}
      </SimpleGrid>
    );
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={refetch} />;
  }

  if (allGroups.length === 0) {
    return (
      <EmptyState
        title={t('groupsTab.emptyTitle')}
        message={t('groupsTab.emptyMessage')}
      />
    );
  }

  const renderGroupCard = (
    group: ResearchGroupResponseDto,
    isLeader: boolean,
  ) => (
    <Box
      key={group.id}
      bg="bg.panel"
      borderWidth="1px"
      borderRadius="lg"
      p="5"
      h="full"
      transition="border-color 0.2s ease"
      _hover={{ borderColor: 'colorPalette.solid' }}
    >
      <Stack gap="3" h="full">
        <Stack
          direction="row"
          gap="2"
          justify="space-between"
          align="flex-start"
        >
          <Box flex="1" minW="0">
            <Heading as="h3" size="sm" fontWeight="semibold" lineHeight="1.3">
              <Link asChild color="fg">
                <NextLink href={`/groups/${group.id}`}>{group.name}</NextLink>
              </Link>
            </Heading>
            <Text textStyle="xs" color="fg.muted">
              {group.code}
            </Text>
          </Box>

          <Badge
            variant={isLeader ? 'solid' : 'outline'}
            colorPalette={isLeader ? 'purple' : 'gray'}
            display="inline-flex"
            alignItems="center"
            gap="1"
          >
            {isLeader ? <Star /> : <Users />}
            {isLeader ? t('groupsTab.leaderBadge') : t('groupsTab.memberBadge')}
          </Badge>
        </Stack>

        {group.description ? (
          <Text textStyle="sm" color="fg.muted" lineClamp={3} lineHeight="1.5">
            {group.description}
          </Text>
        ) : null}
      </Stack>
    </Box>
  );

  return (
    <Stack gap="6" py="1">
      {groupsLed.length > 0 ? (
        <Box>
          <Heading as="h3" size="sm" fontWeight="semibold" mb="3">
            {t('groupsTab.ledTitle')} ({groupsLed.length})
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
            {groupsLed.map((g) => renderGroupCard(g, true))}
          </SimpleGrid>
        </Box>
      ) : null}

      {memberOnlyGroups.length > 0 ? (
        <Box>
          <Heading as="h3" size="sm" fontWeight="semibold" mb="3">
            {t('groupsTab.memberTitle')} ({memberOnlyGroups.length})
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
            {memberOnlyGroups.map((g) => renderGroupCard(g, false))}
          </SimpleGrid>
        </Box>
      ) : null}
    </Stack>
  );
}
