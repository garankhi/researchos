import type { DiscoveryControllerSearchTab } from '@/lib/api/models';

export const searchTabs = [
  'opportunity',
  'people',
  'research',
  'group',
] as const satisfies readonly DiscoveryControllerSearchTab[];
export type SearchTab = (typeof searchTabs)[number];
export const defaultSearchTab: SearchTab = 'opportunity';

export const searchSorts = ['rank', 'title', 'updatedAt'] as const;
export type SearchSort = (typeof searchSorts)[number];

export function readSearchTab(value: string | null): SearchTab {
  return searchTabs.find((tab) => tab === value) ?? defaultSearchTab;
}

export function searchHref(term: string, tab: SearchTab) {
  const parameters = new URLSearchParams({ q: term, tab });
  return `/search?${parameters}`;
}

export function searchTermError(term: string) {
  if (term.includes('\0')) return 'invalid';
  // Match class-validator: a text or emoji presentation selector is part of
  // the preceding character.
  const presentationSequences = term.match(/[^\uFE0E\uFE0F][\uFE0E\uFE0F]/g);
  const length = Array.from(term).length - (presentationSequences?.length ?? 0);
  if (length < 2) return 'minimum';
  if (length > 200) return 'maximum';
  return undefined;
}
