import { Box, Stack } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import {
  getGroupsControllerPreviewQueryKey,
  getProfilesControllerGetPreviewByIdQueryKey,
} from '@/lib/api';
import { AXIOS_INSTANCE } from '@/lib/axios-instance';
import { EntityLink } from './entity-link';

const groupId = 'group-1';
const userId = 'researcher-1';

/**
 * The client pre-seeded with the preview responses the popover reads.
 *
 * Seeding the cache is how a story shows a populated card without a
 * server: the query resolves from the cache and never reaches the
 * network.
 */
function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });

  client.setQueryData(getGroupsControllerPreviewQueryKey(groupId), {
    name: 'AI and Data Systems Lab',
    description:
      'Machine learning, natural language processing and explainable AI for Vietnamese industry.',
    directions: [
      {
        title: 'Robust learning under distribution shift',
        topic: 'Adversarial Robustness',
      },
      {
        title: 'Vietnamese language understanding for scientific texts',
        topic: 'Natural Language Processing',
      },
      {
        title: 'Explainable AI for industrial decision support',
        topic: 'Explainable AI (XAI)',
      },
    ],
  });

  client.setQueryData(getProfilesControllerGetPreviewByIdQueryKey(userId), {
    fullName: 'Trần Thị B',
    departmentUnit: 'Software Engineering',
    academicTitle: 'PGS',
    academicDegree: 'TS',
    bio: 'Associate professor specializing in distributed systems and AI.',
    avatarStorageKey: null,
  });

  return client;
}

const meta = {
  title: 'Discovery/EntityLink',
  component: EntityLink,
  decorators: [
    (Story) => (
      <QueryClientProvider client={seededClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  render: (args) => (
    <Box maxW="6xl" mx="auto" p="4">
      <Stack gap="4">
        <EntityLink {...args} />
      </Stack>
    </Box>
  ),
} satisfies Meta<typeof EntityLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A link to a researcher shows their name, their unit and their bio on
 * hover.
 */
export const Researcher: Story = {
  args: {
    entityType: 'RESEARCHER',
    entityId: userId,
    href: `/profile/${userId}`,
    children: 'Trần Thị B',
  },
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'Trần Thị B' });
    await expect(link).toHaveAttribute('href', `/en/profile/${userId}`);

    await userEvent.hover(link);

    const card = await within(document.body).findByRole('dialog');
    await waitFor(() => {
      expect(
        within(card).getByRole('heading', { name: 'Trần Thị B' }),
      ).toBeVisible();
    });
    await expect(card).toHaveTextContent('Software Engineering');
  },
};

/**
 * A link to a group shows its name, its scope and its directions on
 * hover.
 */
export const Group: Story = {
  args: {
    entityType: 'GROUP',
    entityId: groupId,
    href: `/groups/${groupId}`,
    children: 'AI and Data Systems Lab',
  },
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'AI and Data Systems Lab' });
    await expect(link).toHaveAttribute('href', `/en/groups/${groupId}`);

    await userEvent.hover(link);

    const card = await within(document.body).findByRole('dialog');
    await waitFor(() => {
      expect(
        within(card).getByRole('heading', { name: 'AI and Data Systems Lab' }),
      ).toBeVisible();
    });
    await expect(card).toHaveTextContent('Machine learning');
    await expect(
      within(card).getByText('Robust learning under distribution shift'),
    ).toBeVisible();
  },
};

/**
 * An entity with no preview is still a working link.
 */
export const Output: Story = {
  args: {
    entityType: 'OUTPUT',
    entityId: 'output-1',
    href: '/outputs/output-1',
    children: 'Coupled optical resonators',
  },
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('link', { name: 'Coupled optical resonators' }),
    ).toHaveAttribute('href', '/en/outputs/output-1');
  },
};

/**
 * A card whose preview is still loading shows a skeleton in the shape of
 * the card it will become, not a spinner or a line of text.
 */
export const LoadingGroup: Story = {
  args: {
    entityType: 'GROUP',
    entityId: 'group-loading',
    href: '/groups/group-loading',
    children: 'AI and Data Systems Lab',
  },
  globals: { locale: 'en', colorMode: 'light' },
  beforeEach() {
    const interceptor = AXIOS_INSTANCE.interceptors.request.use((config) => {
      if (!config.url?.includes('/preview')) return config;

      // A request that never settles leaves the query pending, which is
      // the state the skeleton is drawn for.
      config.adapter = () => new Promise(() => {});
      return config;
    });

    return () => AXIOS_INSTANCE.interceptors.request.eject(interceptor);
  },
  play: async ({ canvas, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'AI and Data Systems Lab' });
    await userEvent.hover(link);

    const card = await within(document.body).findByRole('dialog');
    await waitFor(() => {
      expect(within(card).getByTestId('loading-skeleton')).toBeVisible();
    });
  },
};
