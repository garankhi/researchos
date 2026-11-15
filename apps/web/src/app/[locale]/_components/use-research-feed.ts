'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { outputsControllerFindAll } from '@/lib/api';
import { toResearchCard } from './research-feed-data';

const pageSize = 12;

type FeedPage = { page: number; cursor?: string };
const firstPage: FeedPage = { page: 1 };

export function useResearchFeed(userId: string) {
  const {
    data,
    error,
    isPending,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['home-research-feed', userId],
    initialPageParam: firstPage,
    queryFn: ({ pageParam, signal }) =>
      outputsControllerFindAll(
        { feed: 'home', limit: pageSize, ...pageParam },
        undefined,
        signal,
      ),
    getNextPageParam: ({ meta, nextCursor }) =>
      nextCursor ? { page: meta.page + 1, cursor: nextCursor } : undefined,
    staleTime: 60_000,
  });

  const cards = useMemo(() => {
    return (data?.pages ?? []).flatMap(({ items }) =>
      items.flatMap((output) => {
        const card = toResearchCard(output);
        return card ? [card] : [];
      }),
    );
  }, [data]);

  return {
    cards,
    isInitialLoading: isPending,
    isInitialError: !data && Boolean(error),
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  };
}
