'use client';

import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Heading,
  Icon,
  NativeSelect,
  Stack,
  Tabs,
  Text,
} from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useRouter } from '@/i18n/navigation';
import { usePagination } from '@/utils/pagination';
import { useFollowKeys } from '@/features/follow';
import { useSearchCounts, useSearchResults } from '../hooks/use-search-results';
import {
  readSearchTab,
  searchHref,
  searchSorts,
  searchTabs,
  searchTermError,
  type SearchTab,
} from '../search-parameters';
import { SearchForm } from './search-form';
import { SearchResultCard } from './search-result-card';

const resultCardLayout: SkeletonResult = {
  name: 'search-result-card',
  viewportWidth: 768,
  width: 672,
  height: 112,
  bones: [
    [0, 4, 56, 20, 0],
    [0, 42, 82, 14, 0],
    [0, 66, 67, 14, 0],
    [0, 95, 26, 13, 0],
  ],
};

const sortLabels = {
  rank: 'rank',
  title: 'sortTitle',
  updatedAt: 'updatedAt',
} as const;

type SearchViewer = { id: string; canFollow: boolean };

function SearchResultsPanel({
  user,
  term,
  tab,
  active,
  follows,
  followsReady,
}: {
  user: SearchViewer;
  term: string;
  tab: SearchTab;
  active: boolean;
  follows: ReadonlySet<string>;
  followsReady: boolean;
}) {
  const t = useTranslations('search');
  const pagination = usePagination({ sort: '-rank' });
  const results = useSearchResults(
    user.id,
    { ...pagination.query, tab, q: term },
    active,
    pagination.goToPage,
  );
  const meta = results.pageInfo;

  if (!active) return null;

  return (
    <Stack gap={{ base: '3', lg: '4' }}>
      <Flex
        align="center"
        justify="space-between"
        wrap="wrap"
        columnGap="4"
        rowGap="1"
        bg="bg.panel"
        px={{ base: '4', lg: '5' }}
        py={{ base: '3', lg: '4' }}
      >
        <Heading as="h2" size="md">
          {t('resultsIn', { category: t(`tabs.${tab}`) })}
        </Heading>
        <NativeSelect.Root variant="plain" size="sm" w="auto" maxW="full">
          <NativeSelect.Field
            aria-label={t('sort')}
            value={pagination.sort}
            onChange={(event) => pagination.setSort(event.target.value)}
          >
            {searchSorts.map((sort) => (
              <option key={sort} value={sort === 'title' ? sort : `-${sort}`}>
                {t(sortLabels[sort])}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Flex>
      {results.isLoadingPage && (
        <>
          <Box bg="bg.panel" p={{ base: '4', lg: '5' }}>
            <DelayedSkeleton layout={resultCardLayout} />
          </Box>
          <Box bg="bg.panel" p={{ base: '4', lg: '5' }}>
            <DelayedSkeleton layout={resultCardLayout} announce={false} />
          </Box>
        </>
      )}
      {results.isFailed && (
        <ErrorState
          title={t('loadError')}
          onRetry={() => void results.retry()}
        />
      )}
      {results.isEmpty && (
        <EmptyState title={t('empty')} message={t('tryAnother')} />
      )}
      {results.items.map((item) => (
        <SearchResultCard
          key={`${item.entityType}:${item.entityId}`}
          item={item}
          userId={user.id}
          canFollow={user.canFollow}
          follows={follows}
          followsReady={followsReady}
        />
      ))}
      {meta && !results.isEmpty && (
        <Flex
          as="nav"
          aria-label={t('pagination')}
          justify="space-between"
          align="center"
          gap="2"
        >
          <Button
            size="sm"
            variant="outline"
            disabled={!meta.hasPreviousPage}
            onClick={() => pagination.previousPage(meta)}
          >
            {t('previous')}
          </Button>
          <Text textStyle="sm">
            {t('page', { page: meta.page, total: meta.totalPages })}
          </Text>
          <Button
            size="sm"
            variant="outline"
            disabled={!meta.hasNextPage}
            onClick={() => pagination.nextPage(meta)}
          >
            {t('next')}
          </Button>
        </Flex>
      )}
    </Stack>
  );
}

function SearchResults({
  user,
  term,
  tab,
  issue,
}: {
  user: SearchViewer;
  term: string;
  tab: SearchTab;
  issue: ReturnType<typeof searchTermError>;
}) {
  const t = useTranslations('search');
  const follows = useFollowKeys(user.id);

  return (
    <>
      {follows.error ? (
        <ErrorState
          title={t('followingLoadError')}
          onRetry={() => void follows.refetch()}
        />
      ) : null}
      {searchTabs.map((name) => (
        <Tabs.Content key={name} value={name} pt="0">
          {issue ? (
            <Text bg="bg.panel" color="fg.muted" p={{ base: '4', lg: '5' }}>
              {term ? t(issue) : t('startSearching')}
            </Text>
          ) : (
            <SearchResultsPanel
              user={user}
              term={term}
              tab={name}
              active={tab === name}
              follows={follows.keys}
              followsReady={follows.isReady}
            />
          )}
        </Tabs.Content>
      ))}
    </>
  );
}

export function SearchPage({ user }: { user: SearchViewer }) {
  const t = useTranslations('search');
  const params = useSearchParams();
  const router = useRouter();
  const term = (params.get('q') ?? '').trim();
  const tab = readSearchTab(params.get('tab'));
  const issue = searchTermError(term);
  const {
    counts,
    isFailed: countsFailed,
    retry: retryCounts,
  } = useSearchCounts(user.id, term, !issue);

  function changeTab(value: string) {
    router.push(searchHref(term, readSearchTab(value)), { scroll: false });
  }

  return (
    <Tabs.Root
      as="main"
      flex="1"
      bg="home.background"
      variant="line"
      colorPalette="blue"
      value={tab}
      onValueChange={({ value }) => changeTab(value)}
    >
      <Box
        bg={{ lg: 'bg.panel' }}
        borderBottomWidth={{ base: '0', lg: '1px' }}
        borderColor="border"
      >
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '2', lg: '12' }}
        >
          <Heading
            as="h1"
            size={{ base: 'sm', lg: '2xl' }}
            mb={{ base: '3', lg: '7' }}
          >
            <Box as="span" hideFrom="lg">
              {t('label')}
            </Box>
            <Box as="span" hideBelow="lg">
              {t('pageSearch')}
            </Box>
          </Heading>
          <Box w={{ base: 'full', lg: '76.5%' }}>
            <SearchForm
              initialTerm={term}
              onSearch={(nextTerm, nextTab) =>
                router.push(searchHref(nextTerm, nextTab))
              }
              onClear={() => {
                if (term)
                  router.replace(searchHref('', tab), { scroll: false });
              }}
            />
          </Box>
          <Tabs.List
            hideBelow="lg"
            mt="5"
            gap="8"
            borderBottomWidth="0"
            aria-label={t('showResultsIn')}
          >
            {searchTabs.map((name) => (
              <Tabs.Trigger key={name} value={name} height="12" px="0">
                {t(`tabs.${name}`)}
                {counts && <Badge>{counts[name]}</Badge>}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Stack as="label" hideFrom="lg" mt="3" gap="2">
            <Text as="span" textStyle="sm" fontWeight="semibold">
              {t('showResultsIn')}
            </Text>
            <NativeSelect.Root variant="plain" size="lg">
              <NativeSelect.Field
                value={tab}
                onChange={(event) => changeTab(event.target.value)}
                borderBottomWidth="2px"
                borderColor="blue.solid"
                ps="2"
              >
                {searchTabs.map((name) => (
                  <option key={name} value={name}>
                    {t(`tabs.${name}`)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Stack>
        </Container>
      </Box>
      <Container
        maxW="64rem"
        px={{ base: '4', md: '6' }}
        pt={{ base: '3', lg: '5' }}
        pb="8"
      >
        <Grid
          templateColumns={{
            base: 'minmax(0, 1fr)',
            lg: 'minmax(0, 1.9fr) minmax(0, 1fr)',
          }}
          alignItems="start"
          gap="4"
        >
          <Stack gap="4" minW="0">
            {countsFailed && (
              <ErrorState
                title={t('countsError')}
                onRetry={() => void retryCounts()}
              />
            )}
            <SearchResults
              key={`${user.id}:${term}`}
              user={user}
              term={term}
              tab={tab}
              issue={issue}
            />
          </Stack>
          <Stack as="aside" hideBelow="lg" bg="bg.panel" p="5" gap="4">
            <Heading as="h2" size="xl">
              {t('exploreTitle')}
            </Heading>
            <Flex align="center" gap="4">
              <Text color="fg.muted" lineHeight="tall">
                {t('exploreDescription')}
              </Text>
              <Icon boxSize="10" flexShrink="0" color="fg.muted" aria-hidden>
                <Globe />
              </Icon>
            </Flex>
          </Stack>
        </Grid>
      </Container>
    </Tabs.Root>
  );
}
