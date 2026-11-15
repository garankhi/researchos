'use client';

import { Box, Button, Stack } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import NextLink from '@/components/ui/link';
import { useSession } from '@/features/identity';
import { ResearchCard } from './research-card';
import { exampleResearch } from './research-feed-data';
import { ResearchFeedSkeleton } from './research-feed-skeletons';
import { useResearchFeed } from './use-research-feed';

function FeedLoading() {
  return <ResearchFeedSkeleton />;
}

function SignedInResearchFeed({ userId }: { userId: string }) {
  const t = useTranslations('home.feed');
  const endOfFeed = useRef<HTMLDivElement>(null);
  const {
    cards,
    isInitialLoading,
    isInitialError,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  } = useResearchFeed(userId);

  useEffect(() => {
    const target = endOfFeed.current;
    if (
      !target ||
      !hasNextPage ||
      isFetching ||
      isFetchNextPageError ||
      typeof IntersectionObserver === 'undefined'
    )
      return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          observer.disconnect();
          void fetchNextPage({ cancelRefetch: false });
        }
      },
      { rootMargin: '0px 0px 320px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetching, isFetchNextPageError]);

  if (isInitialLoading) return <FeedLoading />;
  if (isInitialError) {
    return <ErrorState title={t('loadError')} onRetry={() => void refetch()} />;
  }
  if (cards.length === 0 && !hasNextPage) {
    return (
      <Box bg="bg.panel">
        <EmptyState title={t('empty')} />
      </Box>
    );
  }

  function loadMore() {
    void fetchNextPage({ cancelRefetch: false });
  }

  return (
    <Stack gap="4">
      {cards.map((item) => (
        <ResearchCard key={item.id} item={item} />
      ))}
      {hasNextPage && (
        <Box ref={endOfFeed} textAlign="center">
          {isFetchNextPageError && !isFetchingNextPage ? (
            <ErrorState title={t('loadMoreError')} onRetry={loadMore} />
          ) : (
            <Button
              variant="outline"
              size="sm"
              loading={isFetchingNextPage}
              loadingText={t('loadingMore')}
              disabled={isFetching}
              onClick={loadMore}
            >
              {t('loadMore')}
            </Button>
          )}
        </Box>
      )}
    </Stack>
  );
}

export function ResearchFeed() {
  const t = useTranslations('home.feed');
  const { user, isChecking, isFailed, refetch } = useSession();

  if (user) return <SignedInResearchFeed key={user.id} userId={user.id} />;
  if (isChecking) return <FeedLoading />;

  return (
    <Stack gap="4">
      {isFailed ? (
        <ErrorState title={t('loadError')} onRetry={() => void refetch()} />
      ) : (
        <Box bg="bg.panel">
          <EmptyState
            title={t('signInPrompt')}
            action={
              <Button asChild variant="outline" size="sm">
                <NextLink href="/login">{t('signIn')}</NextLink>
              </Button>
            }
          />
        </Box>
      )}
      <ResearchCard item={exampleResearch} />
    </Stack>
  );
}
