import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { BrandLink } from './brand-link';

const meta = {
  title: 'Shared/Brand link',
  component: BrandLink,
} satisfies Meta<typeof BrandLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'ResearchOS' });
    await expect(link).toHaveAttribute('href', '/en');
    const wordmark = within(link).getByRole('img', { name: 'ResearchOS' });
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveStyle({ backgroundColor: '#152323' });
  },
};

export const Dark: Story = {
  globals: { locale: 'vi', colorMode: 'dark' },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'ResearchOS' });
    await expect(link).toHaveAttribute('href', '/vi');
    const wordmark = within(link).getByRole('img', { name: 'ResearchOS' });
    await expect(wordmark).toHaveStyle({ backgroundColor: '#ecedeb' });
  },
};
