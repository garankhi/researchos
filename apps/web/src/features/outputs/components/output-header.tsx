'use client';

import Image from 'next/image';
import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Link,
  Separator,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { doiUrl } from '@/lib/doi-url';
import type { OutputDetail } from '../types';
import { EntityLink } from '@/features/discovery';

const VISIBLE_AUTHORS = 6;

const KNOWN_OUTPUT_TYPES = new Set([
  'PAPER',
  'PREPRINT',
  'REVIEW',
  'EDITORIAL',
  'BOOK_CHAPTER',
  'BOOK',
  'DATASET',
  'DISSERTATION',
]);

function humanizeType(raw: string): string {
  const lower = raw.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatPublishedDate(
  format: ReturnType<typeof useFormatter>,
  releasedAt: string | null,
  firstSharedAt: string | null,
  year: number | null,
): string | null {
  const raw = releasedAt ?? firstSharedAt;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return format.dateTime(parsed, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
  }
  if (typeof year === 'number') return String(year);
  return null;
}

export function OutputHeader({
  output,
  groupName,
  groupLoading,
  hasFullText,
  followSlot,
}: {
  output: OutputDetail;
  groupName?: string;
  groupLoading?: boolean;
  hasFullText?: boolean;
  followSlot?: ReactNode;
}) {
  const t = useTranslations('outputs');
  const format = useFormatter();
  const revision = output.revision;
  const [expanded, setExpanded] = useState(false);

  const title = revision?.title ?? t('detail.untitled');
  const outputType = revision?.outputType;
  const typeLabel = outputType
    ? KNOWN_OUTPUT_TYPES.has(outputType)
      ? t(`detail.types.${outputType}`)
      : humanizeType(outputType)
    : null;

  const isDraft = output.sharingStatus !== 'SHARED';
  const publishedDate = formatPublishedDate(
    format,
    revision?.releasedAt ?? null,
    output.firstSharedAt,
    revision?.publicationYear ?? null,
  );

  const dateAndVenue = [publishedDate, revision?.venue, revision?.publisher]
    .filter(Boolean)
    .join(' · ');
  const doi = output.doi;

  const authors = output.authors;
  const visibleAuthors =
    expanded || authors.length <= VISIBLE_AUTHORS
      ? authors
      : authors.slice(0, VISIBLE_AUTHORS);

  const groupId = output.accessGroupId;
  /*
   * The group block renders only for affiliated works. A work with no
   * `accessGroupId` shows no eyebrow and no group row — an "independent
   * work" label would state a fact nobody asked for on every unaffiliated
   * page.
   */
  const groupLabel = groupLoading
    ? t('detail.groupLoading')
    : (groupName ?? null);
  const hasGroupLabel = groupLabel !== null;

  return (
    <Stack gap="4" minW="0">
      {/* Row 0: Group eyebrow with the follow slot, for affiliated works */}
      {groupId ? (
        <>
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            gap="2"
            align={{ base: 'flex-start', sm: 'center' }}
            justify="space-between"
          >
            {hasGroupLabel ? (
              <Box minW="0">
                <EntityLink
                  entityType="GROUP"
                  entityId={groupId}
                  href={`/groups/${groupId}`}
                >
                  {groupLabel}
                </EntityLink>
              </Box>
            ) : null}
            {followSlot}
          </Flex>

          <Separator />
        </>
      ) : null}

      <Stack gap="3" minW="0">
        {/* Row 1: ResearchGate Type + Availability Badges */}
        <Flex gap="2" align="center" flexWrap="wrap">
          {typeLabel ? <Badge colorPalette="blue">{typeLabel}</Badge> : null}

          {isDraft ? (
            <Badge variant="subtle" colorPalette="orange">
              {t('detail.draftBadge')}
            </Badge>
          ) : null}

          {hasFullText ? (
            <Badge variant="subtle" colorPalette="green">
              {t('detail.fullTextAvailable')}
            </Badge>
          ) : null}
        </Flex>

        {/* Row 2: Date & Journal Eyebrow (ResearchGate sits date/journal right above H1) */}
        {dateAndVenue ? (
          <Text textStyle="sm" color="fg.muted">
            {dateAndVenue}
          </Text>
        ) : null}

        {/* Row 3: Large Bold Academic Title */}
        <Heading
          as="h1"
          size={{ base: 'xl', md: '2xl' }}
          fontWeight="bold"
          lineHeight="1.25"
        >
          {title}
        </Heading>

        {/* Row 4: Compact DOI row */}
        {doi ? (
          <Flex
            align="center"
            gap="1.5"
            flexWrap="wrap"
            textStyle="sm"
            color="fg.muted"
          >
            <Text as="span">{t('detail.doiRowLabel')}:</Text>
            <Link
              href={doiUrl(doi)}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              gap="1"
              color="fg"
              layerStyle="researchTextLink"
            >
              <Text as="span">{doi}</Text>
              <Icon
                as={ExternalLink}
                boxSize="3.5"
                flexShrink={0}
                aria-hidden
              />
            </Link>
          </Flex>
        ) : null}

        {/* Row 5: Group affiliation row */}
        {groupId && hasGroupLabel ? (
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            gap={{ base: '0', sm: '3' }}
          >
            <Text
              textStyle="sm"
              color="fg.muted"
              w={{ sm: '24' }}
              flexShrink={0}
            >
              {t('detail.groupRowLabel')}
            </Text>
            <Box minW="0">
              <EntityLink
                entityType="GROUP"
                entityId={groupId}
                href={`/groups/${groupId}`}
              >
                {groupLabel}
              </EntityLink>
            </Box>
          </Flex>
        ) : null}

        {/* Row 6: Horizontal Author Avatars & Profile Links */}
        {authors.length > 0 ? (
          <Flex gap="4" align="center" flexWrap="wrap" pt="1">
            {visibleAuthors.map((author) => (
              <Flex key={author.id} align="center" gap="2" minW="0">
                <Box flexShrink={0} boxSize="8">
                  <Image
                    src="/default-avatar.webp"
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                  />
                </Box>
                <Box minW="0">
                  {author.userId ? (
                    <EntityLink
                      entityType="RESEARCHER"
                      entityId={author.userId}
                      href={`/profile/${author.userId}`}
                    >
                      {author.authorNameString}
                    </EntityLink>
                  ) : (
                    <Text as="span" textStyle="sm" fontWeight="medium">
                      {author.authorNameString}
                    </Text>
                  )}
                  {author.isCorrespondingAuthor ? (
                    <Text as="span" textStyle="xs" color="fg.muted">
                      {' '}
                      ({t('detail.correspondingAuthorBadge')})
                    </Text>
                  ) : null}
                </Box>
              </Flex>
            ))}

            {authors.length > VISIBLE_AUTHORS ? (
              <Button
                variant="plain"
                size="xs"
                layerStyle="researchTextLink"
                px="0"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded
                  ? t('detail.showFewerAuthors')
                  : t('detail.showAllAuthors', { count: authors.length })}
              </Button>
            ) : null}
          </Flex>
        ) : null}
      </Stack>

      {output.topics.length > 0 ? (
        <Flex gap="2" flexWrap="wrap">
          {output.topics.map((topic) => (
            <Badge key={topic.topicId} variant="outline" colorPalette="gray">
              {topic.topicName}
            </Badge>
          ))}
        </Flex>
      ) : null}
    </Stack>
  );
}
