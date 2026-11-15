import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import { OutputFiles } from './output-actions';

const meta = {
  title: 'Outputs/Files',
  component: OutputFiles,
  decorators: [
    (Story) => (
      <SnackbarProvider>
        <Story />
      </SnackbarProvider>
    ),
  ],
} satisfies Meta<typeof OutputFiles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PrivatePdf: Story = {
  args: {
    files: [],
    hasRestrictedPdf: true,
    isLoading: false,
    isFailed: false,
    onRetry: fn(),
  },
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        'This PDF is private. File requests are not available yet.',
      ),
    ).toBeVisible();
    const requestButton = canvas.getByRole('button', { name: 'Request file' });
    await expect(requestButton).toBeVisible();
    await expect(requestButton).toBeDisabled();
  },
};
