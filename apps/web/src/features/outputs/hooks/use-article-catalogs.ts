import { useEffect, useState } from 'react';
import {
  getDiscoveryControllerSearchQueryKey,
  useDiscoveryControllerSearch,
  useTaxonomyControllerFindAllTopics,
} from '@/lib/api';

function useSearchText() {
  const [input, setInput] = useState('');
  const search = input.trim();
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  return { query, search, isDebouncing: query !== search, setInput };
}

export function useArticleCatalogs(
  onBasics: boolean,
  onDetails: boolean,
  userId: string,
) {
  const peopleSearch = useSearchText();
  const topicSearch = useSearchText();
  const searchPeople =
    onBasics &&
    peopleSearch.search.length >= 2 &&
    peopleSearch.search.length <= 200;
  const peopleParams = {
    tab: 'people',
    q: peopleSearch.query,
    limit: 8,
  } as const;
  const people = useDiscoveryControllerSearch(peopleParams, {
    query: {
      enabled: searchPeople && !peopleSearch.isDebouncing,
      queryKey: [...getDiscoveryControllerSearchQueryKey(peopleParams), userId],
    },
  });
  const topics = useTaxonomyControllerFindAllTopics(
    { search: topicSearch.query || undefined, limit: 12, isActive: true },
    { query: { enabled: onDetails && !topicSearch.isDebouncing } },
  );
  return {
    people: {
      items:
        !searchPeople || peopleSearch.isDebouncing
          ? []
          : (people.data?.items ?? [])
              .filter((result) => result.entityType === 'RESEARCHER')
              .map((result) => ({
                displayName:
                  typeof result.authorsText === 'string'
                    ? result.authorsText
                    : result.title,
                userId: result.entityId,
              })),
      isLoading:
        searchPeople && (peopleSearch.isDebouncing || people.isPending),
      isFailed: searchPeople && !peopleSearch.isDebouncing && people.isError,
      search: peopleSearch.setInput,
    },
    topics: {
      items: topicSearch.isDebouncing ? [] : (topics.data?.items ?? []),
      isLoading: topicSearch.isDebouncing || topics.isPending,
      isFailed: !topicSearch.isDebouncing && topics.isError,
      search: topicSearch.setInput,
    },
  };
}
