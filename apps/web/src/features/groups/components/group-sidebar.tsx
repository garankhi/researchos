'use client';

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Link,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Compass, FolderKanban, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import type { Direction, Group, GroupTab, Member, Opportunity } from '../types';

/**
 * The group's right column.
 *
 * Mirrors the profile page's sidebar: a stats card on top, then the
 * lists that are too long to sit in the main column.
 */
export function GroupSidebar({
  group,
  members,
  directions,
  opportunities,
  isLeader,
  active,
  onSelectTab,
}: {
  group: Group;
  members: Member[];
  directions: Direction[];
  opportunities: Opportunity[];
  isLeader: boolean;
  active: boolean;
  onSelectTab: (tab: GroupTab) => void;
}) {
  const t = useTranslations('groups');
  const openOpportunities = opportunities.filter(
    (opportunity) => opportunity.status === 'OPEN',
  );
  const lead = members.find((member) => member.userId === group.leadId);

  return (
    <Stack as="aside" gap="4" minW="0">
      {/* 1. Group stats */}
      <Box bg="bg.panel" boxShadow="xs" p="5">
        <Heading as="h2" size="sm" fontWeight="bold" mb="4">
          {t('statsTitle')}
        </Heading>

        <SimpleGrid columns={3} gap="0" borderTopWidth="1px" pt="3.5">
          <Box pr="3" borderRightWidth="1px">
            <Text fontSize="xl" fontWeight="bold" lineHeight="1.1">
              {members.length}
            </Text>
            <Text textStyle="xs" color="fg.muted" mt="1">
              {t('statsMembers')}
            </Text>
          </Box>

          <Box px="3" borderRightWidth="1px">
            <Text fontSize="xl" fontWeight="bold" lineHeight="1.1">
              {directions.length}
            </Text>
            <Text textStyle="xs" color="fg.muted" mt="1">
              {t('statsDirections')}
            </Text>
          </Box>

          <Box pl="3">
            <Text fontSize="xl" fontWeight="bold" lineHeight="1.1">
              {openOpportunities.length}
            </Text>
            <Text textStyle="xs" color="fg.muted" mt="1">
              {t('statsOpportunities')}
            </Text>
          </Box>
        </SimpleGrid>

        {!active ? (
          <Text textStyle="xs" color="fg.muted" mt="3.5">
            {t('archivedNotice')}
          </Text>
        ) : null}
      </Box>

      {/* 2. Group lead */}
      {lead ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Heading as="h2" size="sm" fontWeight="bold" mb="3.5">
            {t('leadTitle')}
          </Heading>

          <Flex align="center" gap="3" minW="0">
            <Flex
              boxSize="9"
              bg="bg.muted"
              align="center"
              justify="center"
              flexShrink={0}
            >
              <Icon as={Users} boxSize="4" color="fg.muted" aria-hidden />
            </Flex>
            <Box minW="0" flex="1">
              <Link
                asChild
                textStyle="sm"
                fontWeight="semibold"
                layerStyle="researchTextLink"
                display="block"
                truncate
              >
                <NextLink href={`/profile/${lead.userId}`}>
                  {lead.fullName}
                </NextLink>
              </Link>
              <Text textStyle="xs" color="fg.muted" truncate>
                {lead.email}
              </Text>
            </Box>
            <Badge variant="subtle" colorPalette="blue" flexShrink={0}>
              {t('leaderBadge')}
            </Badge>
          </Flex>
        </Box>
      ) : null}

      {/* 3. Research directions summary */}
      {directions.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Flex align="center" justify="space-between" gap="2" mb="3.5">
            <Heading as="h2" size="sm" fontWeight="bold">
              {t('directions')}
            </Heading>
            <Button
              variant="plain"
              size="xs"
              layerStyle="researchTextLink"
              px="0"
              onClick={() => onSelectTab('directions')}
            >
              {t('viewAll')}
            </Button>
          </Flex>

          <Stack gap="3">
            {directions.slice(0, 5).map((direction) => (
              <Flex key={direction.id} align="flex-start" gap="2" minW="0">
                <Icon
                  as={Compass}
                  boxSize="4"
                  color="fg.muted"
                  mt="0.5"
                  flexShrink={0}
                  aria-hidden
                />
                <Box minW="0">
                  <Text textStyle="sm" fontWeight="medium" lineClamp={2}>
                    {direction.title}
                  </Text>
                  {direction.topicPath ? (
                    <Text textStyle="xs" color="fg.muted" lineClamp={2}>
                      {direction.topicPath.topic.name}
                    </Text>
                  ) : null}
                </Box>
              </Flex>
            ))}
          </Stack>
        </Box>
      ) : null}

      {/* 4. Open opportunities summary */}
      {openOpportunities.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Flex align="center" justify="space-between" gap="2" mb="3.5">
            <Heading as="h2" size="sm" fontWeight="bold">
              {t('opportunities')}
            </Heading>
            <Button
              variant="plain"
              size="xs"
              layerStyle="researchTextLink"
              px="0"
              onClick={() => onSelectTab('opportunities')}
            >
              {t('viewAll')}
            </Button>
          </Flex>

          <Stack gap="3">
            {openOpportunities.slice(0, 4).map((opportunity) => (
              <Flex key={opportunity.id} align="flex-start" gap="2" minW="0">
                <Icon
                  as={FolderKanban}
                  boxSize="4"
                  color="fg.muted"
                  mt="0.5"
                  flexShrink={0}
                  aria-hidden
                />
                <Box minW="0">
                  <Text textStyle="sm" fontWeight="medium" lineClamp={2}>
                    {opportunity.title}
                  </Text>
                  <Text textStyle="xs" color="fg.muted">
                    {t(`kinds.${opportunity.opportunityKind}`)}
                  </Text>
                </Box>
              </Flex>
            ))}
          </Stack>
        </Box>
      ) : null}

      {isLeader ? null : (
        <Text textStyle="xs" color="fg.muted">
          {t('readonlyNotice')}
        </Text>
      )}
    </Stack>
  );
}
