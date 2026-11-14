import type { DiscoveryControllerSearchTab } from '@/lib/api/models';

export const searchTabs = [
  'people',
  'research',
  'group',
  'opportunity',
] as const satisfies readonly DiscoveryControllerSearchTab[];
export type SearchTab = (typeof searchTabs)[number];

export const searchSorts = ['rank', 'title', 'updatedAt'] as const;
export type SearchSort = (typeof searchSorts)[number];

export function readSearchTab(value: string | null): SearchTab {
  return searchTabs.find((tab) => tab === value) ?? searchTabs[0];
}

export function searchHref(term: string, tab: SearchTab) {
  const parameters = new URLSearchParams({ q: term, tab });
  return `/search?${parameters}`;
}

export function searchTermError(term: string) {
  const length = Array.from(term).length;
  if (term.includes('\0')) return 'invalid';
  if (length < 2) return 'minimum';
  if (length > 200) return 'maximum';
  return undefined;
}
