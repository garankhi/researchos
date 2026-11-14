'use client';

import { useState } from 'react';
import { Badge, Box, Button, Flex, Heading, Link, Separator, Stack, Text } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import type { OutputDetail } from '../types';

const VISIBLE_AUTHORS = 5;

function humanizeType(raw: string): string {
  const lower = raw.toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatPublishedDate(
  format: ReturnType<typeof useFormatter>,
  releasedAt: string | null,
  firstSharedAt: string | null,
  year: number | null,
): string | null {
  const raw = releasedAt ?? firstSharedAt;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return format.dateTime(parsed, { dateStyle: 'long' });
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
  const publishedDate = formatPublishedDate(
    format,
    revision?.releasedAt ?? null,
    output.firstSharedAt,
    revision?.publicationYear ?? null,
  );
  const doi = output.doi;
  const groupId = output.accessGroupId;

  const authors = output.authors;
  const visibleAuthors =
    expanded || authors.length <= VISIBLE_AUTHORS
      ? authors
      : authors.slice(0, VISIBLE_AUTHORS);

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
                <Link asChild fontWeight="semibold" textStyle="sm" truncate display="block">
                  <NextLink href={`/groups/${groupId}`}>{groupLabel}</NextLink>
                </Link>
              </Box>
            ) : null}
            {followSlot}
          </Flex>

          <Separator />
        </>
      ) : null}

      {outputType ? (
        <Flex gap="2" align="center" flexWrap="wrap">
          <Badge variant="surface" colorPalette="blue">
            {humanizeType(outputType)}
          </Badge>
          {hasFullText ? (
            <Badge variant="outline" colorPalette="green">
              {t('detail.fullTextAvailable')}
            </Badge>
          ) : null}
        </Flex>
      ) : null}

      <Heading as="h1" size="xl" fontWeight="bold" lineHeight="1.25">
        {title}
      </Heading>

      <Stack gap="2">
        {publishedDate ? (
          <Flex direction={{ base: 'column', sm: 'row' }} gap={{ base: '0', sm: '3' }}>
            <Text textStyle="sm" color="fg.muted" w={{ sm: '24' }} flexShrink={0}>
              {t('detail.dateRowLabel')}
            </Text>
            <Text textStyle="sm" minW="0">
              {publishedDate}
            </Text>
          </Flex>
        ) : null}

        {groupId && hasGroupLabel ? (
          <Flex direction={{ base: 'column', sm: 'row' }} gap={{ base: '0', sm: '3' }}>
            <Text textStyle="sm" color="fg.muted" w={{ sm: '24' }} flexShrink={0}>
              {t('detail.groupRowLabel')}
            </Text>
            <Box minW="0">
              <Link asChild textStyle="sm">
                <NextLink href={`/groups/${groupId}`}>{groupLabel}</NextLink>
              </Link>
            </Box>
          </Flex>
        ) : null}

        {doi ? (
          <Flex direction={{ base: 'column', sm: 'row' }} gap={{ base: '0', sm: '3' }}>
            <Text textStyle="sm" color="fg.muted" w={{ sm: '24' }} flexShrink={0}>
              {t('detail.doiRowLabel')}
            </Text>
            <Link
              href={`https://doi.org/${doi}`}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              gap="1"
              textStyle="sm"
              minW="0"
            >
              <Text truncate>{doi}</Text>
              <ExternalLink />
            </Link>
          </Flex>
        ) : null}

        {authors.length > 0 ? (
          <Flex direction={{ base: 'column', sm: 'row' }} gap={{ base: '0', sm: '3' }}>
            <Text textStyle="sm" color="fg.muted" w={{ sm: '24' }} flexShrink={0}>
              {t('detail.authorsLabel')}
            </Text>
            <Box minW="0">
              <Text textStyle="sm">
                {visibleAuthors.map((author, index) => (
                  <span key={author.id}>
                    {index > 0 ? ', ' : null}
                    {author.userId ? (
                      <Link asChild color="fg">
                        <NextLink href={`/profile/${author.userId}`}>
                          {author.authorNameString}
                        </NextLink>
                      </Link>
                    ) : (
                      author.authorNameString
                    )}
                    {author.isCorrespondingAuthor ? (
                      <Text as="span" color="fg.muted">
                        {' '}
                        ({t('detail.correspondingAuthorBadge')})
                      </Text>
                    ) : null}
                  </span>
                ))}
              </Text>
              {authors.length > VISIBLE_AUTHORS ? (
                <Button
                  variant="ghost"
                  size="xs"
                  alignSelf="flex-start"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded
                    ? t('detail.showFewerAuthors')
                    : t('detail.showAllAuthors', { count: authors.length })}
                </Button>
              ) : null}
            </Box>
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
