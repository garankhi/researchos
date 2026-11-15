'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { outputsControllerFindHomeFeed } from '@/lib/api';
import { toResearchCard } from './research-feed-data';

const pageSize = 12;

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
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      outputsControllerFindHomeFeed(
        { limit: pageSize, cursor: pageParam },
        undefined,
        signal,
      ),
    getNextPageParam: ({ meta }) => meta.nextCursor,
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
