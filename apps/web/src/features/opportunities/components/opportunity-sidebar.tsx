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
import { CalendarClock, Flag, Layers, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import type { Opportunity } from '../types';

/**
 * The opportunity's right column.
 *
 * Mirrors the profile, group and output pages: a details card on top,
 * then the group the opportunity belongs to.
 */
export function OpportunitySidebar({
  opportunity,
  groupName,
}: {
  opportunity: Opportunity;
  groupName?: string;
}) {
  const t = useTranslations('opportunities');

  return (
    <Stack as="aside" gap="4" minW="0">
      {/* 1. The details of the call */}
      <Box bg="bg.panel" boxShadow="xs" p="5">
        <Heading as="h2" size="sm" fontWeight="bold" mb="4">
          {t('detailsTitle')}
        </Heading>

        <Stack gap="3.5">
          <Flex gap="3" align="flex-start" minW="0">
            <Icon as={Flag} boxSize="4" color="fg.muted" mt="0.5" aria-hidden />
            <Box minW="0">
              <Text textStyle="xs" color="fg.muted">
                {t('kind')}
              </Text>
              <Text textStyle="sm" fontWeight="medium">
                {t(`kinds.${opportunity.opportunityKind}`)}
              </Text>
            </Box>
          </Flex>

          <Flex gap="3" align="flex-start" minW="0">
            <Icon
              as={Users}
              boxSize="4"
              color="fg.muted"
              mt="0.5"
              aria-hidden
            />
            <Box minW="0">
              <Text textStyle="xs" color="fg.muted">
                {t('audience')}
              </Text>
              <Text textStyle="sm" fontWeight="medium">
                {t(`audiences.${opportunity.targetAudience}`)}
              </Text>
            </Box>
          </Flex>

          <Flex gap="3" align="flex-start" minW="0">
            <Icon
              as={CalendarClock}
              boxSize="4"
              color="fg.muted"
              mt="0.5"
              aria-hidden
            />
            <Box minW="0">
              <Text textStyle="xs" color="fg.muted">
                {t('deadlineLabel')}
              </Text>
              <Text textStyle="sm" fontWeight="medium">
                {opportunity.applicationDeadline
                  ? new Date(
                      opportunity.applicationDeadline,
                    ).toLocaleDateString()
                  : t('noDeadline')}
              </Text>
            </Box>
          </Flex>

          <Flex gap="3" align="flex-start" minW="0">
            <Icon
              as={Layers}
              boxSize="4"
              color="fg.muted"
              mt="0.5"
              aria-hidden
            />
            <Box minW="0">
              <Text textStyle="xs" color="fg.muted">
                {t('slaDays')}
              </Text>
              <Text textStyle="sm" fontWeight="medium">
                {t('slaDaysValue', { days: opportunity.responseSlaDays })}
              </Text>
            </Box>
          </Flex>
        </Stack>
      </Box>

      {/* 2. The expertise the call asks for */}
      {opportunity.requiredExpertiseTags.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Heading as="h2" size="sm" fontWeight="bold" mb="3.5">
            {t('expertiseTitle')}
          </Heading>
          <Flex gap="2" flexWrap="wrap">
            {opportunity.requiredExpertiseTags.map((tag) => (
              <Badge key={tag} variant="subtle" colorPalette="blue">
                {tag}
              </Badge>
            ))}
          </Flex>
        </Box>
      ) : null}

      {/* 3. The group that posted the call */}
      {opportunity.groupId ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Heading as="h2" size="sm" fontWeight="bold" mb="3.5">
            {t('groupTitle')}
          </Heading>
          <Link
            asChild
            textStyle="sm"
            fontWeight="semibold"
            layerStyle="researchTextLink"
            display="block"
          >
            <NextLink href={`/groups/${opportunity.groupId}`}>
              {groupName ?? t('viewGroup')}
            </NextLink>
          </Link>
        </Box>
      ) : null}
    </Stack>
  );
}
