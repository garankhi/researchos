'use client';

import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Image,
  Link,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { BookOpen, ImageIcon, UserRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import NextLink from '@/components/ui/link';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { OutputDownloadPrimaryButton } from '@/features/outputs';
import type { ResearchCardData, ResearchFigure } from './research-feed-data';

const visibleFigureCount = 5;
const outputTypes = {
  ARTICLE: 'article',
  PREPRINT: 'preprint',
  REVIEW: 'review',
  EDITORIAL: 'editorial',
  BOOK_CHAPTER: 'bookChapter',
  BOOK: 'book',
  DATASET: 'dataset',
  DISSERTATION: 'dissertation',
} as const;

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

function FigureThumbnail({ figure }: { figure: ResearchFigure }) {
  const [unavailable, setUnavailable] = useState(false);

  return unavailable ? (
    <Icon as={ImageIcon} boxSize="5" color="fg.muted" />
  ) : (
    <Image
      src={figure.src}
      alt=""
      loading="lazy"
      h="full"
      w="full"
      objectFit="cover"
      onError={() => setUnavailable(true)}
    />
  );
}

function ResearchFigures({
  figures,
  sourceUrl,
}: {
  figures: ResearchFigure[];
  sourceUrl?: string;
}) {
  const t = useTranslations('home.feed');
  const extraCount = figures.length - visibleFigureCount;

  return (
    <SimpleGrid
      as="ul"
      columns={Math.min(figures.length, visibleFigureCount)}
      gap={{ base: '1', md: '1.5' }}
      listStyle="none"
    >
      {figures.slice(0, visibleFigureCount).map((figure, index) => {
        const showMore =
          index === visibleFigureCount - 1 && extraCount > 0 && sourceUrl;

        return (
          <Box as="li" key={figure.src} minW="0">
            <Link
              href={showMore ? sourceUrl : figure.src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                showMore
                  ? t('moreFigures', { count: extraCount })
                  : t('figure', { number: figure.number })
              }
              display="grid"
              placeItems="center"
              aspectRatio="square"
              overflow="hidden"
              borderWidth="1px"
              position="relative"
              bg="bg.muted"
            >
              <FigureThumbnail figure={figure} />
              {showMore && (
                <Box
                  aria-hidden="true"
                  position="absolute"
                  inset="0"
                  display="grid"
                  placeItems="center"
                  bg="blackAlpha.600"
                  color="white"
                  fontWeight="semibold"
                  fontSize={{ base: 'md', md: 'xl' }}
                >
                  +{extraCount}
                </Box>
              )}
            </Link>
          </Box>
        );
      })}
    </SimpleGrid>
  );
}

function ResearchActions({
  publicationUrl,
  downloadUrl,
  downloadablePdf,
}: Pick<
  ResearchCardData,
  'publicationUrl' | 'downloadUrl' | 'downloadablePdf'
>) {
  const t = useTranslations('home.feed');
  const common = useTranslations('common');
  const { showSnackbar } = useSnackbar();
  const [copyFailed, setCopyFailed] = useState(false);
  const copyErrorId = useId();

  async function copyLink() {
    if (!publicationUrl) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(publicationUrl);
      showSnackbar({ severity: 'success', message: t('linkCopied') });
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <Flex
      borderTopWidth="1px"
      pt="3"
      gap={{ base: '1', md: '2' }}
      justify="space-between"
      flexWrap="wrap"
    >
      <Flex gap="1" align="start" wrap="wrap">
        {downloadablePdf ? (
          <OutputDownloadPrimaryButton
            file={downloadablePdf}
            label={t('download')}
            buttonProps={accessButtonProps}
          />
        ) : downloadUrl ? (
          <Button asChild {...accessButtonProps}>
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              {t('download')}
            </a>
          </Button>
        ) : null}
        <Button {...textActionProps} minW="9" px="3.5" disabled>
          {common('save')}
        </Button>
        {publicationUrl && (
          <Button asChild {...accessButtonProps}>
            <a href={publicationUrl} target="_blank" rel="noopener noreferrer">
              {t('viewPublication')}
            </a>
          </Button>
        )}
      </Flex>
      <Stack gap="1" align="end">
        <Flex align="center" gap="3.5px" wrap="wrap">
          <Button {...textActionProps} disabled>
            {t('follow')}
          </Button>
          <Button {...textActionProps} disabled>
            {t('recommend')}
          </Button>
          <Button
            {...textActionProps}
            disabled={!publicationUrl}
            aria-describedby={copyFailed ? copyErrorId : undefined}
            onClick={() => void copyLink()}
          >
            {t('share')}
          </Button>
        </Flex>
        {copyFailed && (
          <Text id={copyErrorId} role="alert" textStyle="sm" color="fg.error">
            {t('copyError')}
          </Text>
        )}
      </Stack>
    </Flex>
  );
}

export function ResearchCard({ item }: { item: ResearchCardData }) {
  const t = useTranslations('home.feed');
  const format = useFormatter();
  const type = Object.hasOwn(outputTypes, item.type)
    ? outputTypes[item.type as keyof typeof outputTypes]
    : undefined;
  const publicationDate = item.publicationDate
    ? format.dateTime(new Date(item.publicationDate), {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : item.publicationYear?.toString();
  const metadata = [
    publicationDate,
    item.reads === undefined
      ? undefined
      : t('readCount', { count: item.reads }),
    item.citations === undefined
      ? undefined
      : t('citationCount', { count: item.citations }),
  ].filter(Boolean);
  const venue = [item.venue, item.publisher].filter(Boolean).join(' · ');
  const titleLink = item.detailHref ? (
    <NextLink href={item.detailHref}>{item.title}</NextLink>
  ) : item.publicationUrl ? (
    <a href={item.publicationUrl} target="_blank" rel="noopener noreferrer">
      {item.title}
    </a>
  ) : null;

  return (
    <Box as="article" bg="bg.panel" boxShadow="xs" overflowWrap="anywhere">
      <Stack gap="3" p={{ base: '4', md: '6' }}>
        {item.figures && item.figures.length > 0 && (
          <ResearchFigures
            figures={item.figures}
            sourceUrl={item.figureSourceUrl}
          />
        )}
        <Heading as="h2" size="lg" fontWeight="bold">
          {titleLink ? (
            <Link asChild layerStyle="researchTextLink">
              {titleLink}
            </Link>
          ) : (
            item.title
          )}
        </Heading>
        <Flex align="center" gap="2" wrap="wrap">
          <Badge colorPalette="blue">{type ? t(type) : item.type}</Badge>
          {metadata.length > 0 && (
            <Text textStyle="sm" color="fg.muted">
              {metadata.join(' · ')}
            </Text>
          )}
          {item.isExample && <Badge colorPalette="gray">{t('example')}</Badge>}
        </Flex>
        {venue && (
          <Flex align="center" gap="2" textStyle="sm">
            <Icon as={BookOpen} color="fg.muted" aria-hidden />
            <Text>{venue}</Text>
          </Flex>
        )}
        {item.authors.length > 0 && (
          <Flex
            as="ul"
            listStyle="none"
            gapX="3"
            gapY="1"
            wrap="wrap"
            textStyle="sm"
          >
            {item.authors.map((author) => (
              <Flex as="li" key={author.id} align="center" gap="1.5">
                <Icon as={UserRound} aria-hidden boxSize="4" color="fg.muted" />
                {author.userId ? (
                  <Link asChild>
                    <NextLink href={`/profile/${author.userId}`}>
                      {author.name}
                    </NextLink>
                  </Link>
                ) : (
                  author.name
                )}
              </Flex>
            ))}
          </Flex>
        )}
        <ResearchActions
          publicationUrl={item.publicationUrl}
          downloadUrl={item.downloadUrl}
          downloadablePdf={item.downloadablePdf}
        />
        {item.figureSourceUrl && (
          <Link
            href={item.figureSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            textStyle="xs"
            color="fg.muted"
          >
            {t('figureSource')}
          </Link>
        )}
      </Stack>
    </Box>
  );
}
