import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getRouter } from '@storybook/nextjs-vite/navigation.mock';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, fn, waitFor, within } from 'storybook/test';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import {
  getDiscoveryControllerCountsQueryKey,
  getDiscoveryControllerSearchQueryKey,
} from '@/lib/api';
import { AXIOS_INSTANCE } from '@/lib/axios-instance';
import { SearchPage } from './search-page';

const user = { id: 'reader', canFollow: false };
const term = 'quantum';
const outputTitle = 'Quantum optics in coupled resonators';

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(
    [...getDiscoveryControllerCountsQueryKey({ q: term }), user.id],
    {
      people: 21,
      research: 1,
      group: 0,
      opportunity: 0,
    },
  );

  for (const page of [1, 2]) {
    client.setQueryData(
      [
        ...getDiscoveryControllerSearchQueryKey({
          q: term,
          tab: 'people',
          sort: '-rank',
          page,
          limit: 20,
        }),
        user.id,
      ],
      {
        items: [
          {
            entityType: 'RESEARCHER',
            entityId: `researcher-${page}`,
            title:
              page === 1
                ? 'Quantum optics researcher'
                : 'Quantum computing researcher',
            body: 'Research profile',
            authorsText: 'Research group',
            updatedAt: '2026-02-01T12:00:00.000Z',
          },
        ],
        meta: {
          page,
          limit: 20,
          total: 21,
          totalPages: 2,
          hasPreviousPage: page > 1,
          hasNextPage: page < 2,
        },
      },
    );
  }

  client.setQueryData(
    [
      ...getDiscoveryControllerSearchQueryKey({
        q: term,
        tab: 'research',
        sort: '-rank',
        page: 1,
        limit: 20,
      }),
      user.id,
    ],
    {
      items: [
        {
          entityType: 'OUTPUT',
          entityId: 'output-1',
          title: outputTitle,
          body: 'We measured a change in the spectrum of coupled resonators.',
          authorsText: 'Minh Nguyen, Linh Tran',
          updatedAt: '2026-02-01T12:00:00.000Z',
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    },
  );

  return client;
}

const meta = {
  title: 'Discovery/Search page',
  component: SearchPage,
  args: { user },
  decorators: [
    (Story) => (
      <QueryClientProvider client={seededClient()}>
        <SnackbarProvider>
          <Story />
        </SnackbarProvider>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      navigation: { pathname: '/en/search', query: { q: term, tab: 'people' } },
    },
  },
} satisfies Meta<typeof SearchPage>;

export default meta;

export const Results: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getAllByRole('tab')).toHaveLength(4);
    const homeTab = canvas.getByRole('tab', { name: /People/ });
    await expect(within(homeTab).getByText('21')).toBeVisible();
    const result = canvas.getByRole('heading', {
      name: 'Search results in People',
    });
    const guide = canvas.getByRole('complementary');
    await expect(guide).toBeVisible();
    expect(guide.getBoundingClientRect().left).toBeGreaterThan(
      result.getBoundingClientRect().right,
    );
    await expect(
      canvas.getByRole('link', { name: 'Quantum optics researcher' }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(
      await canvas.findByRole('link', { name: 'Quantum computing researcher' }),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Next' })).toBeDisabled();

    await userEvent.click(canvas.getByRole('tab', { name: /Outputs/ }));
    await expect(getRouter().push).toHaveBeenCalledWith(
      '/en/search?q=quantum&tab=research',
      expect.anything(),
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Clear search' }));
    await expect(canvas.getByRole('searchbox')).toHaveValue('');
    await expect(canvas.getByRole('searchbox')).toHaveFocus();
    await expect(getRouter().replace).toHaveBeenCalledWith(
      '/en/search?q=&tab=people',
      expect.anything(),
    );
  },
};

export const MobileResults: StoryObj<typeof meta> = {
  globals: { locale: 'en', viewport: { value: 'mobile1' } },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('tablist')).toBeNull();
    await expect(canvas.queryByRole('complementary')).toBeNull();
    const category = canvas.getByRole('combobox', { name: 'Show results in' });
    await expect(category).toHaveValue('people');
    await expect(canvas.getByRole('article')).toBeVisible();
    await userEvent.selectOptions(category, 'group');
    await expect(getRouter().push).toHaveBeenCalledWith(
      '/en/search?q=quantum&tab=group',
      expect.anything(),
    );
  },
};

export const OutputResults: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/en/search',
        query: { q: term, tab: 'research' },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: outputTitle }),
    ).toBeVisible();
    await expect(canvas.getByText('Minh Nguyen, Linh Tran')).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Sort by' })).toHaveValue(
      '-rank',
    );
  },
};

const pageRequest = fn();

export const RecoverRemovedPage: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/en/search',
        query: { q: 'changing results', tab: 'people' },
      },
    },
  },
  beforeEach() {
    pageRequest.mockClear();
    let total = 21;
    const interceptor = AXIOS_INSTANCE.interceptors.request.use((config) => {
      if (config.url === '/search/counts') {
        config.adapter = async () => ({
          config,
          data: { people: total, research: 0, group: 0, opportunity: 0 },
          status: 200,
          statusText: 'OK',
          headers: {},
        });
      }
      if (config.url === '/search') {
        const page = Number(config.params.page);
        pageRequest(page);
        if (page === 2) total = 1;
        config.adapter = async () => ({
          config,
          data: {
            items:
              page === 1
                ? [
                    {
                      entityType: 'RESEARCHER',
                      entityId: 'remaining-researcher',
                      title: 'Remaining researcher',
                      updatedAt: '2026-02-01T12:00:00.000Z',
                    },
                  ]
                : [],
            meta: {
              page,
              limit: 20,
              total,
              totalPages: Math.ceil(total / 20),
              hasPreviousPage: page === 2,
              hasNextPage: page === 1 && total > 20,
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
        });
      }
      return config;
    });
    return () => AXIOS_INSTANCE.interceptors.request.eject(interceptor);
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText('Page 1 of 2')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(await canvas.findByText('Page 1 of 1')).toBeVisible();
    await expect(canvas.getByText('Remaining researcher')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(pageRequest.mock.calls).toEqual([[1], [2], [1]]);
  },
};

const followRequest = fn();

export const FollowAndUnfollow: StoryObj<typeof meta> = {
  args: { user: { ...user, canFollow: true } },
  globals: { locale: 'en' },
  beforeEach() {
    followRequest.mockClear();
    const interceptor = AXIOS_INSTANCE.interceptors.request.use((config) => {
      const { method, url, data } = config;
      if (!url?.startsWith('/follows')) return config;

      followRequest(method, url, data);
      config.adapter = async () => ({
        config,
        data:
          method === 'get'
            ? { items: [], meta: { hasNextPage: false } }
            : undefined,
        status: method === 'delete' ? 204 : 200,
        statusText: 'OK',
        headers: {},
      });
      return config;
    });

    return () => AXIOS_INSTANCE.interceptors.request.eject(interceptor);
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const location = canvasElement.ownerDocument.location;
    const initialUrl = location.href;
    const follow = await canvas.findByRole('button', { name: 'Follow' });
    await waitFor(() => expect(follow).toBeEnabled());
    await userEvent.click(follow);
    await expect(
      await canvas.findByRole('button', { name: 'Unfollow' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(followRequest).toHaveBeenCalledWith('post', '/follows', {
      entityType: 'RESEARCHER',
      entityId: 'researcher-1',
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Unfollow' }));
    await expect(
      await canvas.findByRole('button', { name: 'Follow' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(followRequest).toHaveBeenCalledWith(
      'delete',
      '/follows/RESEARCHER/researcher-1',
      undefined,
    );
    expect(location.href).toBe(initialUrl);
  },
};
