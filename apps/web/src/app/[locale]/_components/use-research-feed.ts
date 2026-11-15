'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { outputsControllerFindAll } from '@/lib/api';
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
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      outputsControllerFindAll(
        { feed: 'home', page: pageParam, limit: pageSize },
        undefined,
        signal,
      ),
    getNextPageParam: ({ meta }) =>
      meta.hasNextPage ? meta.page + 1 : undefined,
    staleTime: 60_000,
  });

  const cards = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages ?? []).flatMap(({ items }) =>
      items.flatMap((output) => {
        if (seen.has(output.id)) return [];
        seen.add(output.id);
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
