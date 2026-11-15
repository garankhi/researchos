import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@chakra-ui/react';
import { expect, waitFor, within } from 'storybook/test';
import { SnackbarProvider, useSnackbar } from './snackbar-provider';

function ToastExample({ message }: { message: string }) {
  const { showSnackbar } = useSnackbar();

  return (
    <Button onClick={() => showSnackbar({ message, autoHideDuration: null })}>
      Show notification
    </Button>
  );
}

const meta = {
  title: 'Shared/Snackbar',
  component: ToastExample,
  decorators: [
    (Story) => (
      <SnackbarProvider>
        <Story />
      </SnackbarProvider>
    ),
  ],
} satisfies Meta<typeof ToastExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  args: { message: 'Signed in successfully.' },
  globals: { locale: 'en' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show notification' }),
    );
    const toast = await within(canvasElement.ownerDocument.body).findByRole(
      'status',
    );
    expect(toast.getBoundingClientRect().width).toBeLessThan(300);
  },
};

export const MobileLongMessage: Story = {
  args: {
    message: 'A long notification that wraps inside the toast. '.repeat(6),
  },
  globals: { locale: 'en', viewport: { value: 'mobile1' } },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show notification' }),
    );
    const page = within(canvasElement.ownerDocument.body);
    const toast = await page.findByRole('status');
    const viewportWidth =
      canvasElement.ownerDocument.documentElement.clientWidth;
    const { left, right } = toast.getBoundingClientRect();
    expect(left).toBeGreaterThanOrEqual(12);
    expect(right).toBeLessThanOrEqual(viewportWidth - 12);
    const description = within(toast).getByText(args.message.trim());
    expect(description.scrollWidth).toBe(description.clientWidth);
    const close = within(toast).getByRole('button', { name: 'Close' });
    await waitFor(() => expect(close).toBeVisible());
  },
};
