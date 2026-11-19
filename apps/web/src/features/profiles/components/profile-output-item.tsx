'use client';

import { useId, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  Icon,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { BookOpen, ExternalLink, UserRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { doiUrl } from '@/lib/doi-url';
import { useProfileOutputCapability } from '../hooks/use-profile-output-capability';
import type { OutputResponseDto } from '../types';
import { ProfileOutputActionsMenu } from './profile-output-actions-menu';

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

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function ProfileOutputItem({
  output,
  showBottomBorder = true,
}: {
  output: OutputResponseDto;
  showBottomBorder?: boolean;
}) {
  const t = useTranslations('profile');
  const format = useFormatter();
  const { showSnackbar } = useSnackbar();
  const capability = useProfileOutputCapability({ output });
  const [copyFailed, setCopyFailed] = useState(false);
  const copyErrorId = useId();

  const rev = output.currentRevision;
  const title = rev?.title || `Output #${output.id.slice(0, 8)}`;
  const rawType = rev?.outputType ?? 'PAPER';
  const typeLabel = KNOWN_OUTPUT_TYPES.has(rawType)
    ? t(`outputsTab.types.${rawType}`)
    : rawType;

  const isDraft = output.sharingStatus !== 'SHARED';
  const abstractStr = asTrimmedString(rev?.abstract);
  const venueStr = asTrimmedString(rev?.venue);
  const publisherStr = asTrimmedString(rev?.publisher);
  const venueLine = [venueStr, publisherStr].filter(Boolean).join(' · ');

  const doiStr = asTrimmedString(output.doi);
  const externalUrlStr = asTrimmedString(rev?.externalUrl);
  const sourceUrl = doiStr ? doiUrl(doiStr) : externalUrlStr;

  const releasedStr =
    typeof rev?.releasedAt === 'string' ? rev.releasedAt : null;
  const firstSharedStr =
    typeof output.firstSharedAt === 'string' ? output.firstSharedAt : null;
  const dateSource = releasedStr ?? firstSharedStr;
  const yearStr =
    typeof rev?.publicationYear === 'number' ||
    typeof rev?.publicationYear === 'string'
      ? String(rev.publicationYear)
      : null;

  const formattedDate = dateSource
    ? format.dateTime(new Date(dateSource), {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : yearStr;

  const orderedAuthors = [...(output.authors ?? [])].sort(
    (a, b) => a.authorOrder - b.authorOrder,
  );
  const showMenu = capability.role !== 'reader';

  const handleCopyShareLink = async () => {
    setCopyFailed(false);
    try {
      const targetUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/outputs/${output.id}`
          : `/outputs/${output.id}`;
      await navigator.clipboard.writeText(targetUrl);
      showSnackbar({
        severity: 'success',
        message: t('outputsTab.linkCopied'),
      });
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <Box
      as="article"
      py="5"
      px={{ base: '4', md: '6' }}
      borderBottomWidth={showBottomBorder ? '1px' : '0'}
      borderColor="border"
      overflowWrap="anywhere"
    >
      <Stack gap="2.5">
        <Flex justify="space-between" align="flex-start" gap="3">
          <Flex align="center" gap="2" wrap="wrap" minW="0">
            <Badge colorPalette="blue">{typeLabel}</Badge>
            {isDraft ? (
              <Badge variant="subtle" colorPalette="orange">
                {t('outputsTab.draftBadge')}
              </Badge>
            ) : null}
            {formattedDate ? (
              <Text textStyle="sm" color="fg.muted">
                {formattedDate}
              </Text>
            ) : null}
            {!isDraft && output.visibility ? (
              <Badge variant="outline" colorPalette="gray">
                {output.visibility === 'FPTU_COMMUNITY'
                  ? t('outputsTab.visibilityPublic')
                  : output.visibility === 'RESEARCH_GROUP'
                    ? t('outputsTab.visibilityGroupOnly')
                    : String(output.visibility)}
              </Badge>
            ) : null}
          </Flex>

          {showMenu ? (
            <HStack gap="1" flexShrink={0}>
              <ProfileOutputActionsMenu
                output={output}
                capability={capability}
              />
            </HStack>
          ) : null}
        </Flex>

        <Heading as="h3" size="md" fontWeight="bold" lineHeight="1.35">
          <Link asChild layerStyle="researchTextLink">
            <NextLink href={`/outputs/${output.id}`}>{title}</NextLink>
          </Link>
        </Heading>

        {venueLine ? (
          <Flex align="center" gap="2" textStyle="sm" color="fg.muted">
            <Icon as={BookOpen} boxSize="4" flexShrink={0} aria-hidden />
            <Text fontStyle="italic">{venueLine}</Text>
          </Flex>
        ) : null}

        {orderedAuthors.length > 0 ? (
          <Flex
            as="ul"
            listStyle="none"
            gapX="3"
            gapY="1"
            wrap="wrap"
            textStyle="sm"
          >
            {orderedAuthors.map((author) => {
              const linkedUserId =
                typeof author.userId === 'string' ? author.userId : null;
              return (
                <Flex as="li" key={author.id} align="center" gap="1.5">
                  <Icon
                    as={UserRound}
                    boxSize="3.5"
                    color="fg.muted"
                    aria-hidden
                  />
                  {linkedUserId ? (
                    <Link asChild layerStyle="researchTextLink">
                      <NextLink href={`/profile/${linkedUserId}`}>
                        {author.authorNameString}
                      </NextLink>
                    </Link>
                  ) : (
                    <Text as="span">{author.authorNameString}</Text>
                  )}
                </Flex>
              );
            })}
          </Flex>
        ) : null}

        {abstractStr ? (
          <Text textStyle="sm" color="fg.muted" lineClamp={2} lineHeight="1.55">
            {abstractStr}
          </Text>
        ) : null}

        {output.topics && output.topics.length > 0 ? (
          <Flex gap="1.5" wrap="wrap" pt="0.5">
            {output.topics.slice(0, 5).map((topic) => (
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
                  {t('outputsTab.viewPublication')}
                </a>
              </Button>
            ) : null}
            <Link asChild textStyle="sm" layerStyle="researchTextLink">
              <NextLink href={`/outputs/${output.id}`}>
                {t('outputsTab.viewDetails')}
              </NextLink>
            </Link>
            {doiStr ? (
              <Link
                href={doiUrl(doiStr)}
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap="1"
                textStyle="xs"
                color="fg.muted"
              >
                {`DOI: ${doiStr}`}
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
              {t('outputsTab.share')}
            </Button>
            {copyFailed ? (
              <Text
                id={copyErrorId}
                role="alert"
                textStyle="xs"
                color="fg.error"
              >
                {t('outputsTab.copyError')}
              </Text>
            ) : null}
          </Stack>
        </Flex>
      </Stack>
    </Box>
  );
}
