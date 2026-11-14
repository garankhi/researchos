import { Stack } from '@chakra-ui/react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTranslations } from 'next-intl';
import { expect, fn } from 'storybook/test';
import { EmptyState, ErrorState, ListItemSkeleton } from './feedback';

const meta = {
  title: 'Shared/Feedback',
} satisfies Meta;

export default meta;

type Story = StoryObj<{ onRetry?: () => void }>;

export const Loading: Story = {
  render: () => (
    <Stack gap="2" maxW={640}>
      <ListItemSkeleton />
      <ListItemSkeleton />
      <ListItemSkeleton />
    </Stack>
  ),
  play: async ({ canvas }) => {
    const [firstRow] = canvas.getAllByTestId('list-item-skeleton');
    const avatar = firstRow.querySelector('[data-testid="loading-skeleton"]');
    await expect(avatar).toHaveStyle({ width: '40px', height: '40px' });
  },
};

function EmptyExample() {
  const t = useTranslations('storybook.feedback');

  return <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />;
}

export const Empty: Story = { render: () => <EmptyExample /> };

function ErrorExample({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations('storybook.feedback');

  return (
    <ErrorState
      title={t('errorTitle')}
      message={t('errorMessage')}
      onRetry={onRetry}
    />
  );
}

export const ErrorWithRetry: Story = {
  args: { onRetry: fn() },
  render: (args) => <ErrorExample {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};
