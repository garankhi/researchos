'use client';

import { Badge, Flex, Heading, Icon, Stack, Text } from '@chakra-ui/react';
import { Clock, FolderKanban, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Opportunity } from '../types';

/**
 * The badge colour of a lifecycle status.
 *
 * The palette reads as a progression: a draft is quiet, an open call is
 * green, a filled one is blue, and a finished one goes grey.
 */
export function statusPalette(status: Opportunity['status']) {
  switch (status) {
    case 'OPEN':
      return 'green' as const;
    case 'FILLED':
      return 'blue' as const;
    case 'CLOSED':
    case 'EXPIRED':
      return 'gray' as const;
    default:
      return 'orange' as const;
  }
}

/**
 * The opportunity's hero banner.
 *
 * Sits above the tab strip in the full-bleed white band, the same way the
 * profile, group and output detail pages put their header there.
 */
export function OpportunityHeader({
  opportunity,
  groupName,
}: {
  opportunity: Opportunity;
  groupName?: string;
}) {
  const t = useTranslations('opportunities');

  return (
    <Stack gap="3" minW="0">
      <Flex gap="2" align="center" flexWrap="wrap">
        <Badge
          variant="subtle"
          colorPalette={statusPalette(opportunity.status)}
        >
          {t(`statuses.${opportunity.status}`)}
        </Badge>
        <Badge variant="subtle" colorPalette="gray">
          {t(`kinds.${opportunity.opportunityKind}`)}
        </Badge>
        {opportunity.archivedAt ? (
          <Badge variant="subtle" colorPalette="gray">
            {t('archived')}
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
        {opportunity.title}
      </Heading>

      <Flex gap="3" align="center" flexWrap="wrap" textStyle="sm">
        <Flex align="center" gap="1.5" color="fg.muted">
          <Icon as={Users} boxSize="3.5" aria-hidden />
          <Text as="span">{t(`audiences.${opportunity.targetAudience}`)}</Text>
        </Flex>
        {groupName ? (
          <Flex align="center" gap="1.5" color="fg.muted">
            <Icon as={FolderKanban} boxSize="3.5" aria-hidden />
            <Text as="span">{groupName}</Text>
          </Flex>
        ) : null}
        {opportunity.applicationDeadline ? (
          <Flex align="center" gap="1.5" color="fg.muted">
            <Icon as={Clock} boxSize="3.5" aria-hidden />
            <Text as="span">
              {t('deadline', {
                date: new Date(
                  opportunity.applicationDeadline,
                ).toLocaleDateString(),
              })}
            </Text>
          </Flex>
        ) : null}
      </Flex>
    </Stack>
  );
}
