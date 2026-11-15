import { Box, Stack } from '@chakra-ui/react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { ProfileHeaderSkeleton, ProfileTabSkeleton } from './profile-skeletons';

const meta = {
  title: 'Profiles/Loading',
  component: ProfileTabSkeleton,
  args: { tab: 'groups' },
  render: (args) => (
    <Box maxW="6xl" mx="auto" p="4">
      <Stack gap="6">
        <ProfileHeaderSkeleton announce={false} />
        <ProfileTabSkeleton {...args} />
      </Stack>
    </Box>
  ),
} satisfies Meta<typeof ProfileTabSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PublicProfile: Story = {
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('status');
    await waitFor(() => {
      const avatar = canvasElement.querySelector(
        '[data-boneyard="profile-avatar-desktop"]',
      );
      const details = canvasElement.querySelector(
        '[data-boneyard="profile-header-details-desktop"]',
      );
      expect(avatar).toBeVisible();
      expect(details).toBeVisible();
      expect(
        details!.getBoundingClientRect().left -
          avatar!.getBoundingClientRect().right,
      ).toBeCloseTo(24, 0);
    });
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
  },
};

export const OwnerProfile: Story = {
  args: { tab: 'openalex', isOwner: true },
  globals: {
    locale: 'en',
    colorMode: 'dark',
    viewport: { value: 'mobile1' },
  },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('status');
    await waitFor(() => {
      const avatar = canvasElement.querySelector(
        '[data-boneyard="profile-avatar-mobile"]',
      );
      const details = canvasElement.querySelector(
        '[data-boneyard="profile-header-details-mobile"]',
      );
      expect(avatar).toBeVisible();
      expect(details).toBeVisible();
      if (!avatar || !details) throw new Error('Profile header bones are missing');
      expect(details.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        avatar.getBoundingClientRect().bottom + 24,
      );
    });
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
  },
};
