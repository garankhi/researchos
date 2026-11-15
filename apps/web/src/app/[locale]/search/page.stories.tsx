import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AxiosError } from 'axios';
import { expect, fn } from 'storybook/test';
import { QueryProvider } from '@/components/providers/query-provider';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import type { MeDto } from '@/lib/api/models';
import { AXIOS_INSTANCE } from '@/lib/axios-instance';
import SearchRoute from './page';

const me: MeDto = {
  id: 'reader',
  email: 'reader@example.test',
  fullName: 'Search reader',
  userType: 'STAFF',
  departmentUnit: 'Research',
  academicTitle: null,
  academicDegree: null,
  roles: ['ADMIN'],
  onboardingCompleted: true,
  profileConfirmed: true,
  mustChangePassword: false,
};

const meta = {
  title: 'Routes/Search',
  component: SearchRoute,
  decorators: [
    (Story) => (
      <QueryProvider>
        <SnackbarProvider>
          <Story />
        </SnackbarProvider>
      </QueryProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      navigation: {
        pathname: '/en/search',
        query: { q: 'expired', tab: 'people' },
      },
    },
  },
} satisfies Meta<typeof SearchRoute>;

export default meta;

const request = fn();

export const ExpiredSession: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  beforeEach() {
    request.mockClear();
    let expired = false;
    const interceptor = AXIOS_INSTANCE.interceptors.request.use((config) => {
      const { url } = config;
      if (url === '/search/counts' || url === '/search' || url === '/me') {
        config.adapter = async () => {
          request(url);
          if (url === '/search') expired = true;
          if (url === '/search' || (url === '/me' && expired)) {
            throw new AxiosError('Unauthorized', undefined, config, undefined, {
              config,
              data: {},
              status: 401,
              statusText: 'Unauthorized',
              headers: {},
            });
          }
          return {
            config,
            data:
              url === '/me'
                ? me
                : { people: 1, research: 0, group: 0, opportunity: 0 },
            status: 200,
            statusText: 'OK',
            headers: {},
          };
        };
      }
      return config;
    });
    return () => AXIOS_INSTANCE.interceptors.request.eject(interceptor);
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('heading', { name: 'Sign in required' }),
    ).toBeVisible();
    const returnTo = encodeURIComponent('/search?q=expired&tab=people');
    await expect(canvas.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/en/login?returnTo=${returnTo}`,
    );
    expect(
      request.mock.calls.filter(([url]) => url !== '/search/counts'),
    ).toEqual([['/me'], ['/search'], ['/me']]);
  },
};
