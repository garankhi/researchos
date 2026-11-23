'use client';

import { useId, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { BookOpen, ExternalLink, UserRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { EntityLink } from '@/features/discovery';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { doiUrl } from '@/lib/doi-url';

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

const accessButtonProps = {
  variant: 'outline',
  size: 'xs',
  layerStyle: 'researchAccess',
} as const;

const textActionProps = {
  variant: 'plain',
  size: 'sm',
  layerStyle: 'researchTextLink',
  minW: '0',
  px: '0',
} as const;

/**
 * The card shape, normalised.
 *
 * The profile page and the group page both list works, but they do not
 * start from the same payload: the profile lists the work's *current*
 * revision, while a group pins one *specific* revision and must never
 * substitute a newer release for it. Rather than teach one component two
 * data shapes, each caller maps its payload into this view model and the
 * card stays presentational.
 */
export interface OutputCardAuthor {
  id: string;
  name: string;
  userId: string | null;
}

export interface OutputCardTopic {
  topicId: string;
  topicName: string;
}

export interface OutputCardData {
  /** The work id — used for the link to the detail page. */
  id: string;
  title: string;
  /** Raw output type, e.g. `PAPER`. */
  outputType: string;
  /** The abstract, or `null`. */
  abstract: string | null;
  /** Venue and publisher, joined for the eyebrow line. */
  venueLine: string | null;
  /** ISO date the work was released, or `null`. */
  releasedAt: string | null;
  /** ISO date the work was first shared, used when there is no release date. */
  firstSharedAt: string | null;
  /** Publication year, used when there is no date at all. */
  publicationYear: string | null;
  /** DOI without a URL prefix, or `null`. */
  doi: string | null;
  /** External source URL, used when the work carries no DOI. */
  externalUrl: string | null;
  /** Whether the work is published and visible to the community. */
  isDraft: boolean;
  /** Visibility scope, or `null` when the work is a draft. */
  visibility: string | null;
  authors: OutputCardAuthor[];
  topics: OutputCardTopic[];
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Builds the card view model from the fields both callers already hold.
 *
 * Shared by the profile page (current revision) and the group page
 * (pinned revision), so the two render the same card from the same rules.
 */
export function toOutputCardData({
  id,
  title,
  outputType,
  abstract,
  venue,
  publisher,
  releasedAt,
  firstSharedAt,
  publicationYear,
  doi,
  externalUrl,
  sharingStatus,
  visibility,
  authors,
  topics,
}: {
  id: string;
  title: string;
  outputType: string;
  abstract?: unknown;
  venue?: unknown;
  publisher?: unknown;
  releasedAt?: unknown;
  firstSharedAt?: unknown;
  publicationYear?: unknown;
  doi?: unknown;
  externalUrl?: unknown;
  sharingStatus?: string;
  visibility?: string | null;
  authors?: {
    id: string;
    authorNameString: string;
    authorOrder: number;
    userId?: unknown;
  }[];
  topics?: { topicId: string; topicName: string }[];
}): OutputCardData {
  const abstractStr = asTrimmedString(abstract);
  const venueStr = asTrimmedString(venue);
  const publisherStr = asTrimmedString(publisher);
  const doiStr = asTrimmedString(doi);
  const externalUrlStr = asTrimmedString(externalUrl);
  const releasedStr = typeof releasedAt === 'string' ? releasedAt : null;
  const firstSharedStr =
    typeof firstSharedAt === 'string' ? firstSharedAt : null;
  const yearStr =
    typeof publicationYear === 'number' || typeof publicationYear === 'string'
      ? String(publicationYear)
      : null;

  const orderedAuthors = [...(authors ?? [])]
    .sort((a, b) => a.authorOrder - b.authorOrder)
    .map((author) => ({
      id: author.id,
      name: author.authorNameString,
      userId: typeof author.userId === 'string' ? author.userId : null,
    }));

  return {
    id,
    title,
    outputType,
    abstract: abstractStr,
    venueLine: [venueStr, publisherStr].filter(Boolean).join(' · ') || null,
    releasedAt: releasedStr,
    firstSharedAt: firstSharedStr,
    publicationYear: yearStr,
    doi: doiStr,
    externalUrl: externalUrlStr,
    isDraft: sharingStatus ? sharingStatus !== 'SHARED' : false,
    visibility: visibility ?? null,
    authors: orderedAuthors,
    topics: (topics ?? []).map((topic) => ({
      topicId: topic.topicId,
      topicName: topic.topicName,
    })),
  };
}

/**
 * The work card shared by the profile page and the group page.
 *
 * Both pages list the same kind of thing — a work, its type, its date and
 * venue, its authors and a way into the detail page — so they share this
 * card instead of each keeping its own. The card is presentational: the
 * caller passes the normalised data and any extra actions (a review
 * decision, a visibility menu) as children.
 */
export function OutputCard({
  data,
  showBottomBorder = true,
  flush = false,
  headerSlot,
  footerSlot,
  children,
}: {
  data: OutputCardData;
  showBottomBorder?: boolean;
  /**
   * Drops the card's own horizontal padding, for use inside a panel that
   * already provides it.
   */
  flush?: boolean;
  /** Rendered at the top-right of the card, next to the badges. */
  headerSlot?: React.ReactNode;
  /** Rendered after the action row. */
  footerSlot?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useTranslations('outputs.card');
  const format = useFormatter();
  const { showSnackbar } = useSnackbar();
  const [copyFailed, setCopyFailed] = useState(false);
  const copyErrorId = useId();

  const typeLabel = KNOWN_OUTPUT_TYPES.has(data.outputType)
    ? t(`types.${data.outputType}`)
    : data.outputType;

  const sourceUrl = data.doi ? doiUrl(data.doi) : data.externalUrl;

  const dateSource = data.releasedAt ?? data.firstSharedAt;
  const formattedDate = dateSource
    ? format.dateTime(new Date(dateSource), {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : data.publicationYear;

  const handleCopyShareLink = async () => {
    setCopyFailed(false);
    try {
      const targetUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/outputs/${data.id}`
          : `/outputs/${data.id}`;
      await navigator.clipboard.writeText(targetUrl);
      showSnackbar({
        severity: 'success',
        message: t('linkCopied'),
      });
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <Box
      as="article"
      py="5"
      px={flush ? '0' : { base: '4', md: '6' }}
      borderBottomWidth={showBottomBorder ? '1px' : '0'}
      borderColor="border"
      overflowWrap="anywhere"
    >
      <Stack gap="2.5">
        <Flex justify="space-between" align="flex-start" gap="3">
          <Flex align="center" gap="2" wrap="wrap" minW="0">
            <Badge colorPalette="blue">{typeLabel}</Badge>
            {data.isDraft ? (
              <Badge variant="subtle" colorPalette="orange">
                {t('draftBadge')}
              </Badge>
            ) : null}
            {formattedDate ? (
              <Text textStyle="sm" color="fg.muted">
                {formattedDate}
              </Text>
            ) : null}
            {!data.isDraft && data.visibility ? (
              <Badge variant="outline" colorPalette="gray">
                {data.visibility === 'FPTU_COMMUNITY'
                  ? t('visibilityPublic')
                  : data.visibility === 'RESEARCH_GROUP'
                    ? t('visibilityGroupOnly')
                    : data.visibility}
              </Badge>
            ) : null}
          </Flex>

          {headerSlot ? (
            <Box flexShrink={0} position="relative">
              {headerSlot}
            </Box>
          ) : null}
        </Flex>

        <Heading as="h3" size="md" fontWeight="bold" lineHeight="1.35">
          <Link asChild layerStyle="researchTextLink">
            <NextLink href={`/outputs/${data.id}`}>{data.title}</NextLink>
          </Link>
        </Heading>

        {data.venueLine ? (
          <Flex align="center" gap="2" textStyle="sm" color="fg.muted">
            <Icon as={BookOpen} boxSize="4" flexShrink={0} aria-hidden />
            <Text fontStyle="italic">{data.venueLine}</Text>
          </Flex>
        ) : null}

        {data.authors.length > 0 ? (
          <Flex
            as="ul"
            listStyle="none"
            gapX="3"
            gapY="1"
            wrap="wrap"
            textStyle="sm"
          >
            {data.authors.map((author) => (
              <Flex as="li" key={author.id} align="center" gap="1.5">
                <Icon
                  as={UserRound}
                  boxSize="3.5"
                  color="fg.muted"
                  aria-hidden
                />
                {author.userId ? (
                  <EntityLink
                    entityType="RESEARCHER"
                    entityId={author.userId}
                    href={`/profile/${author.userId}`}
                  >
                    {author.name}
                  </EntityLink>
                ) : (
                  <Text as="span">{author.name}</Text>
                )}
              </Flex>
            ))}
          </Flex>
        ) : null}

        {data.abstract ? (
          <Text textStyle="sm" color="fg.muted" lineClamp={2} lineHeight="1.55">
            {data.abstract}
          </Text>
        ) : null}

        {data.topics.length > 0 ? (
          <Flex gap="1.5" wrap="wrap" pt="0.5">
            {data.topics.slice(0, 5).map((topic) => (
              <Badge
                key={topic.topicId}
                variant="subtle"
                colorPalette="gray"
                fontWeight="normal"
              >
                {topic.topicName}
              </Badge>
            ))}
          </Flex>
        ) : null}

        <Flex
          pt="2"
          gap="3"
          align="center"
          justify="space-between"
          flexWrap="wrap"
        >
          <Flex gap="2.5" align="center" wrap="wrap">
            {sourceUrl ? (
              <Button asChild {...accessButtonProps}>
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  {t('viewPublication')}
                </a>
              </Button>
            ) : null}
            <Link asChild textStyle="sm" layerStyle="researchTextLink">
              <NextLink href={`/outputs/${data.id}`}>
                {t('viewDetails')}
              </NextLink>
            </Link>
            {data.doi ? (
              <Link
                href={doiUrl(data.doi)}
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap="1"
                textStyle="xs"
                color="fg.muted"
              >
                {`DOI: ${data.doi}`}
                <Icon as={ExternalLink} boxSize="3" aria-hidden />
              </Link>
            ) : null}
          </Flex>

          <Stack gap="1" align="end">
            <Button
              {...textActionProps}
              aria-describedby={copyFailed ? copyErrorId : undefined}
              onClick={() => void handleCopyShareLink()}
            >
              {t('share')}
            </Button>
            {copyFailed ? (
              <Text
                id={copyErrorId}
                role="alert"
                textStyle="xs"
                color="fg.error"
              >
                {t('copyError')}
              </Text>
            ) : null}
          </Stack>
        </Flex>

        {footerSlot}
        {children}
      </Stack>
    </Box>
  );
}
