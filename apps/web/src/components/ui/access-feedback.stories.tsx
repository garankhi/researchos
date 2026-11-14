import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { AccessFeedback } from './access-feedback';

const meta = {
  title: 'Shared/Access feedback',
  component: AccessFeedback,
} satisfies Meta<typeof AccessFeedback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unauthorized: Story = {
  args: { status: 401 },
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Sign in required' }),
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/en/login',
    );
  },
};

export const Forbidden: Story = {
  args: { status: 403 },
  globals: { locale: 'vi', colorMode: 'dark' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Không có quyền truy cập' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Về trang chủ' }),
    ).toHaveAttribute('href', '/vi');
  },
};

export const NotFound: Story = {
  args: { status: 404 },
};
