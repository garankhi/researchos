import { Box } from '@chakra-ui/react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { expect, waitFor } from 'storybook/test';
import { DelayedSkeleton } from './delayed-skeleton';

const rowLayout = {
  name: 'storybook-loading-row',
  viewportWidth: 390,
  width: 320,
  height: 52,
  bones: [
    [0, 6, 12.5, 40, 0],
    [17, 9, 77, 12, 0],
    [17, 30, 53, 12, 0],
  ],
};

function LoadingExample({ fast = false }: { fast?: boolean }) {
  const t = useTranslations('storybook.feedback');
  const common = useTranslations('common');
  const [loading, setLoading] = useState(!fast);

  function retry() {
    setLoading(true);
    setTimeout(() => setLoading(false), 25);
  }

  return (
    <>
      {loading ? (
        <DelayedSkeleton layout={rowLayout} />
      ) : (
        <Box>{t('emptyTitle')}</Box>
      )}
      <button type="button" onClick={fast ? retry : () => setLoading(false)}>
        {fast ? common('retry') : t('finishLoading')}
      </button>
    </>
  );
}

const meta = {
  title: 'Shared/Delayed skeleton',
  component: LoadingExample,
} satisfies Meta<typeof LoadingExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SlowResponse: Story = {
  globals: { locale: 'en' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole('status');
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll('[data-boneyard-bone]'),
      ).toHaveLength(3),
    );

    await userEvent.click(
      canvas.getByRole('button', { name: 'Finish loading' }),
    );
    await expect(canvas.getByText('No research results')).toBeVisible();
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
  },
};

export const FastResponse: Story = {
  args: { fast: true },
  globals: { locale: 'en' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const loadingAnnouncements: Node[] = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element && node.matches('[role="status"]')) {
            loadingAnnouncements.push(node);
          }
        }
      }
    });
    observer.observe(canvasElement, { childList: true, subtree: true });

    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
      await expect(
        await canvas.findByText('No research results'),
      ).toBeVisible();
      await expect(loadingAnnouncements).toHaveLength(0);
    } finally {
      observer.disconnect();
    }
  },
};
