import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { ChatWorkspaceSkeleton } from './chat-skeletons';

const meta = {
  title: 'Chat/Loading',
  component: ChatWorkspaceSkeleton,
} satisfies Meta<typeof ChatWorkspaceSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WorkspaceLoading: Story = {
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findAllByRole('status');
    await waitFor(() => {
      const desktopBone = canvasElement.querySelector(
        '[data-boneyard="chat-workspace-desktop"]',
      );
      expect(desktopBone).not.toBeNull();
    });
  },
};
