import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect } from 'storybook/test';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import type { SearchResultItemDto } from '@/lib/api/models';
import { SearchResultCard } from './search-result-card';

const userId = 'reader';

function item(
  entityType: SearchResultItemDto['entityType'],
  entityId: string,
  title: string,
): SearchResultItemDto {
  return {
    entityType,
    entityId,
    revisionId: null,
    ownerId: null,
    visibility: 'FPTU_COMMUNITY',
    accessGroupId: null,
    title,
    // The generated type is wider than the wire: the API sends a string
    // here, and the card narrows it at runtime.
    body: 'A short description of the entity.' as unknown as SearchResultItemDto['body'],
    authorsText:
      'Minh Nguyen, Linh Tran' as unknown as SearchResultItemDto['authorsText'],
    rank: 1,
    updatedAt: '2026-02-01T12:00:00.000Z',
  };
}

const meta = {
  title: 'Discovery/Search result card',
  component: SearchResultCard,
  decorators: [
    (Story) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { staleTime: Infinity } },
          })
        }
      >
        <SnackbarProvider>
          <Story />
        </SnackbarProvider>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    item: item('RESEARCHER', 'researcher-1', 'A researcher'),
    userId,
    canFollow: false,
    follows: new Set<string>(),
    followsReady: true,
  },
} satisfies Meta<typeof SearchResultCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every kind of result links to the screen that shows it, so a reader can
 * open any of them from the search.
 */
export const EveryResultLinksToItsScreen: Story = {
  args: {
    item: item('RESEARCHER', 'researcher-1', 'A researcher'),
  },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <SearchResultCard
        item={item('RESEARCHER', 'researcher-1', 'A researcher')}
        userId={userId}
        canFollow={false}
        follows={new Set<string>()}
        followsReady
      />
      <SearchResultCard
        item={item('GROUP', 'group-1', 'A research group')}
        userId={userId}
        canFollow={false}
        follows={new Set<string>()}
        followsReady
      />
      <SearchResultCard
        item={item('OUTPUT', 'output-1', 'A published output')}
        userId={userId}
        canFollow={false}
        follows={new Set<string>()}
        followsReady
      />
      <SearchResultCard
        item={item('OPPORTUNITY', 'opportunity-1', 'An opportunity')}
        userId={userId}
        canFollow={false}
        follows={new Set<string>()}
        followsReady
      />
    </div>
  ),
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('link', { name: 'A researcher' }),
    ).toHaveAttribute('href', '/en/profile/researcher-1');
    await expect(
      canvas.getByRole('link', { name: 'A research group' }),
    ).toHaveAttribute('href', '/en/groups/group-1');
    await expect(
      canvas.getByRole('link', { name: 'A published output' }),
    ).toHaveAttribute('href', '/en/outputs/output-1');
    await expect(
      canvas.getByRole('link', { name: 'An opportunity' }),
    ).toHaveAttribute('href', '/en/opportunities/opportunity-1');
  },
};
