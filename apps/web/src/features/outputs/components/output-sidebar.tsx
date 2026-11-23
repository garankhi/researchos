'use client';

import {
  Badge,
  Box,
  Flex,
  Heading,
  Icon,
  Link,
  Separator,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ExternalLink, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { FollowButton } from '@/features/follow';
import type { OutputDetail } from '../types';
import { formatPublishedDate } from './output-header';
import { EntityLink } from '@/features/discovery';

export function OutputSidebar({
  output,
  groupName,
  groupLoading,
}: {
  output: OutputDetail;
  groupName?: string;
  groupLoading?: boolean;
}) {
  const t = useTranslations('outputs');
  const format = useFormatter();
  const rev = output.revision;

  const publishedDate = formatPublishedDate(
    format,
    rev?.releasedAt ?? null,
    output.firstSharedAt,
    rev?.publicationYear ?? null,
  );

  const visibilityLabel =
    output.sharingStatus !== 'SHARED'
      ? t('detail.visibilityPrivate')
      : output.visibility === 'RESEARCH_GROUP'
        ? t('detail.visibilityGroupOnly')
        : t('detail.visibilityPublic');

  const groupId = output.accessGroupId;
  const groupLabel = groupLoading
    ? t('detail.groupLoading')
    : (groupName ?? null);

  return (
    <Stack as="aside" gap="4" minW="0">
      {/* 1. Publication Metadata Card */}
      <Box bg="bg.panel" boxShadow="xs" p="5">
        <Heading as="h2" size="sm" fontWeight="bold" mb="3.5">
          {t('detail.metadataTitle')}
        </Heading>

        <Stack gap="3">
          {publishedDate ? (
            <Box>
              <Text textStyle="xs" color="fg.muted">
                {t('detail.dateRowLabel')}
              </Text>
              <Text textStyle="sm" fontWeight="medium">
                {publishedDate}
              </Text>
            </Box>
          ) : null}

          {rev?.venue ? (
            <Box>
              <Text textStyle="xs" color="fg.muted">
                {t('detail.venueRowLabel')}
              </Text>
              <Text textStyle="sm">{rev.venue}</Text>
            </Box>
          ) : null}

          {rev?.publisher ? (
            <Box>
              <Text textStyle="xs" color="fg.muted">
                {t('detail.publisherRowLabel')}
              </Text>
              <Text textStyle="sm">{rev.publisher}</Text>
            </Box>
          ) : null}

          {output.doi ? (
            <Box>
              <Text textStyle="xs" color="fg.muted">
                {t('detail.doiRowLabel')}
              </Text>
              <Link
                href={`https://doi.org/${output.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap="1"
                textStyle="sm"
                layerStyle="researchTextLink"
                wordBreak="break-all"
              >
                <Text as="span">{output.doi}</Text>
                <Icon
                  as={ExternalLink}
                  boxSize="3.5"
                  flexShrink={0}
                  aria-hidden
                />
              </Link>
            </Box>
          ) : null}

          {rev?.externalUrl ? (
            <Box>
              <Link
                href={rev.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap="1"
                textStyle="sm"
                layerStyle="researchTextLink"
              >
                <Text as="span">{t('detail.externalLink')}</Text>
                <Icon
                  as={ExternalLink}
                  boxSize="3.5"
                  flexShrink={0}
                  aria-hidden
                />
              </Link>
            </Box>
          ) : null}

          <Separator />

          <Box>
            <Text textStyle="xs" color="fg.muted">
              {t('detail.visibilityRowLabel')}
            </Text>
            <Text textStyle="sm">{visibilityLabel}</Text>
          </Box>
        </Stack>
      </Box>

      {/* 2. Affiliated Lab / Research Group Card */}
      {groupId && groupLabel ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Heading as="h2" size="sm" fontWeight="bold" mb="3.5">
            {t('detail.affiliatedGroupTitle')}
          </Heading>

          <Stack gap="3.5">
            <Flex align="flex-start" gap="2.5">
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
                <EntityLink
                  entityType="GROUP"
                  entityId={groupId}
                  href={`/groups/${groupId}`}
                >
                  {groupLabel}
                </EntityLink>
              </Box>
            </Flex>

            <Box alignSelf="flex-start">
              <FollowButton entityType="GROUP" entityId={groupId} />
            </Box>
          </Stack>
        </Box>
      ) : null}

      {/* 3. Research Topics Card */}
      {output.topics.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs" p="5">
          <Heading as="h2" size="sm" fontWeight="bold" mb="3.5">
            {t('detail.topicsTitle')}
          </Heading>

          <Flex gap="2" flexWrap="wrap">
            {output.topics.map((topic) => (
              <Badge
                key={topic.topicId}
                variant="subtle"
                colorPalette="gray"
                px="2.5"
                py="1"
                fontWeight="medium"
              >
                {topic.topicName}
              </Badge>
            ))}
          </Flex>
        </Box>
      ) : null}
    </Stack>
  );
}
