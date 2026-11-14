'use client';

import { useState } from 'react';
import { Badge, Box, Button, Flex, Heading, Link, Stack, Text } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import type { OutputDetail } from '../types';

const VISIBLE_AUTHORS = 5;

export function OutputHeader({ output }: { output: OutputDetail }) {
  const t = useTranslations('outputs');
  const revision = output.revision;
  const [expanded, setExpanded] = useState(false);

  const title = revision?.title ?? t('detail.untitled');
  const venue = revision?.venue;
  const publisher = revision?.publisher;
  const year = revision?.publicationYear;
  const doi = output.doi;
  const externalUrl = revision?.externalUrl;

  const authors = output.authors;
  const visibleAuthors =
    expanded || authors.length <= VISIBLE_AUTHORS
      ? authors
      : authors.slice(0, VISIBLE_AUTHORS);

  return (
    <Box bg="bg.panel" borderWidth="1px" borderRadius="lg" p={{ base: '4', md: '6' }}>
      <Stack gap="3" minW="0">
        {venue || publisher ? (
          <Text textStyle="sm" color="fg.muted" fontStyle="italic" truncate>
            {[venue, publisher].filter(Boolean).join(' • ')}
          </Text>
        ) : null}

        <Heading as="h1" size="lg" fontWeight="bold" lineHeight="1.3">
          {title}
        </Heading>

        <Flex gap="3" align="center" flexWrap="wrap">
          {typeof year === 'number' ? (
            <Text textStyle="sm" color="fg.muted">
              {t('detail.publishedYear', { year })}
            </Text>
          ) : null}

          {doi ? (
            <Link
              href={`https://doi.org/${doi}`}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              gap="1"
              textStyle="xs"
            >
              {t('detail.doiLabel', { doi })}
              <ExternalLink />
            </Link>
          ) : null}

          {externalUrl ? (
            <Link
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              gap="1"
              textStyle="xs"
            >
              {t('detail.externalLink')}
              <ExternalLink />
            </Link>
          ) : null}
        </Flex>

        {authors.length > 0 ? (
          <Box>
            <Text textStyle="sm" color="fg.muted" mb="1">
              {t('detail.authorsLabel')}
            </Text>
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
        ) : null}

        {output.topics.length > 0 ? (
          <Flex gap="2" flexWrap="wrap">
            {output.topics.map((topic) => (
              <Badge
                key={topic.topicId}
                variant="outline"
                colorPalette="gray"
              >
                {topic.topicName}
              </Badge>
            ))}
          </Flex>
        ) : null}
      </Stack>
    </Box>
  );
}
