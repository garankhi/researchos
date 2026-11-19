'use client';

import { Badge, Flex, Heading, Icon, Stack, Text } from '@chakra-ui/react';
import { Hash, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Group } from '../types';

/**
 * The group's hero banner.
 *
 * Sits above the tab strip in the full-bleed white band, the same way
 * the profile and output detail pages put their header there.
 */
export function GroupHeader({
  group,
  memberCount,
  isLeader,
  active,
}: {
  group: Group;
  memberCount: number;
  isLeader: boolean;
  active: boolean;
}) {
  const t = useTranslations('groups');

  return (
    <Stack gap="3" minW="0">
      <Flex gap="2" align="center" flexWrap="wrap">
        <Badge variant="subtle" colorPalette={active ? 'green' : 'gray'}>
          {t(active ? 'active' : 'archived')}
        </Badge>
        {isLeader ? (
          <Badge variant="subtle" colorPalette="blue">
            {t('leaderBadge')}
          </Badge>
        ) : null}
      </Flex>

      <Heading
        as="h1"
        size={{ base: 'xl', md: '2xl' }}
        fontWeight="bold"
        lineHeight="1.2"
        overflowWrap="anywhere"
      >
        {group.name}
      </Heading>

      <Flex gap="3" align="center" flexWrap="wrap" textStyle="sm">
        <Flex align="center" gap="1.5" color="fg.muted">
          <Icon as={Hash} boxSize="3.5" aria-hidden />
          <Text as="span">{group.code}</Text>
        </Flex>
        <Flex align="center" gap="1.5" color="fg.muted">
          <Icon as={Users} boxSize="3.5" aria-hidden />
          <Text as="span">{t('memberCount', { count: memberCount })}</Text>
        </Flex>
      </Flex>

      {group.description ? (
        <Text
          textStyle="sm"
          color="fg.muted"
          lineHeight="1.55"
          whiteSpace="pre-wrap"
          maxW="48rem"
        >
          {group.description}
        </Text>
      ) : null}
    </Stack>
  );
}
