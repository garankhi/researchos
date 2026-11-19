'use client';

import {
  Badge,
  Box,
  Flex,
  Heading,
  Icon,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useProfileGroups } from '../../hooks/use-profile-groups';
import type { ResearchGroupResponseDto } from '../../types';
import { ProfileTabSkeleton } from '../profile-skeletons';

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
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ProfileTabSkeleton tab="groups" />
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

  if (allGroups.length === 0) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <EmptyState
          title={t('groupsTab.emptyTitle')}
          message={t('groupsTab.emptyMessage')}
        />
      </Box>
    );
  }

  const renderGroupRow = (
    group: ResearchGroupResponseDto,
    isLeader: boolean,
    showBottomBorder: boolean,
  ) => (
    <Box
      key={group.id}
      py="4"
      px={{ base: '4', md: '6' }}
      borderBottomWidth={showBottomBorder ? '1px' : '0'}
      borderColor="border"
    >
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="3"
        justify="space-between"
        align={{ base: 'flex-start', sm: 'flex-start' }}
      >
        <Flex gap="3" align="flex-start" flex="1" minW="0">
          <Flex
            boxSize="10"
            bg="bg.muted"
            align="center"
            justify="center"
            flexShrink={0}
            mt="0.5"
          >
            <Icon as={Users} boxSize="5" color="fg.muted" aria-hidden />
          </Flex>

          <Stack gap="1" minW="0" flex="1">
            <Heading as="h3" size="sm" fontWeight="bold" lineHeight="1.35">
              <Link asChild layerStyle="researchTextLink">
                <NextLink href={`/groups/${group.id}`}>{group.name}</NextLink>
              </Link>
            </Heading>

            <Text textStyle="xs" color="fg.muted">
              {group.code}
            </Text>

            {group.description ? (
              <Text
                textStyle="sm"
                color="fg.muted"
                lineClamp={2}
                lineHeight="1.55"
                pt="0.5"
              >
                {group.description}
              </Text>
            ) : null}
          </Stack>
        </Flex>

        <Badge
          variant="subtle"
          colorPalette={isLeader ? 'blue' : 'gray'}
          flexShrink={0}
        >
          {isLeader ? t('groupsTab.leaderBadge') : t('groupsTab.memberBadge')}
        </Badge>
      </Flex>
    </Box>
  );

  return (
    <Stack gap="4">
      {groupsLed.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs">
          <Box
            px={{ base: '4', md: '6' }}
            py="4"
            borderBottomWidth="1px"
            borderColor="border"
          >
            <Heading as="h2" size="md" fontWeight="bold">
              {t('groupsTab.ledTitle')} ({groupsLed.length})
            </Heading>
          </Box>
          <Box>
            {groupsLed.map((g, idx) =>
              renderGroupRow(g, true, idx < groupsLed.length - 1),
            )}
          </Box>
        </Box>
      ) : null}

      {memberOnlyGroups.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs">
          <Box
            px={{ base: '4', md: '6' }}
            py="4"
            borderBottomWidth="1px"
            borderColor="border"
          >
            <Heading as="h2" size="md" fontWeight="bold">
              {t('groupsTab.memberTitle')} ({memberOnlyGroups.length})
            </Heading>
          </Box>
          <Box>
            {memberOnlyGroups.map((g, idx) =>
              renderGroupRow(g, false, idx < memberOnlyGroups.length - 1),
            )}
          </Box>
        </Box>
      ) : null}
    </Stack>
  );
}
