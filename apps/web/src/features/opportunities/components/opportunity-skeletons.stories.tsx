import { Box } from '@chakra-ui/react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { OpportunityApplicationsSkeleton } from './opportunity-skeletons';

const meta = {
  title: 'Opportunities/Loading',
  component: OpportunityApplicationsSkeleton,
  render: () => (
    <Box maxW="6xl" mx="auto" p="4">
      <OpportunityApplicationsSkeleton />
    </Box>
  ),
} satisfies Meta<typeof OpportunityApplicationsSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The applications panel reserves the space the list will occupy, and
 * announces the loading state once.
 */
export const Applications: Story = {
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole('status');
    await waitFor(() => {
      const rows = canvasElement.querySelectorAll(
        '[data-boneyard="opportunity-application-row"]',
      );
      expect(rows).toHaveLength(3);
    });
    // Exactly one announcement for the whole region.
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
  },
};
