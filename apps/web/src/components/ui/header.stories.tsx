import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getRouter } from '@storybook/nextjs-vite/navigation.mock';
import { expect, waitFor, within } from 'storybook/test';
import { Button } from '@chakra-ui/react';
import Header from './header';

const meta = {
  title: 'Shared/Header',
  component: Header,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/en' } },
  },
} satisfies Meta<typeof Header>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas, userEvent }) => {
    const navigation = within(
      canvas.getByRole('navigation', { name: 'Main navigation' }),
    );
    const home = navigation.getByRole('link', { name: 'Home' });
    await expect(home).toHaveAttribute('href', '/en');
    await expect(home).toHaveAttribute('aria-current', 'page');
    const search = canvas.getByRole('searchbox', { name: 'Search' });
    await expect(search).toBeEnabled();
    await userEvent.type(search, 'a{Enter}');
    await expect(
      canvas.getByText('Enter at least 2 characters.'),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
    await userEvent.clear(search);
    await userEvent.type(search, 'quantum{Enter}');
    await expect(getRouter().push).toHaveBeenCalledWith(
      '/en/search?q=quantum&tab=people',
    );
    await expect(navigation.getAllByRole('link')).toHaveLength(1);
    for (const name of ['Opportunities', 'Groups']) {
      await expect(navigation.getByRole('button', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
    for (const name of [
      'Update notifications',
      'Messages',
      'Request notifications',
    ]) {
      await expect(canvas.getByRole('button', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
  },
};

export const Vietnamese: Story = {
  globals: { locale: 'vi', colorMode: 'light' },
  parameters: { nextjs: { navigation: { pathname: '/vi' } } },
};

export const Mobile: Story = {
  args: {
    accountSlot: (
      <Button
        variant="ghost"
        boxSize="11"
        minW="11"
        aria-label="Menu tài khoản"
      />
    ),
  },
  globals: {
    locale: 'vi',
    colorMode: 'dark',
    viewport: { value: 'mobile1' },
  },
  parameters: { nextjs: { navigation: { pathname: '/vi' } } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const header = canvas.getByRole('banner');
    const brand = canvas.getByRole('link', { name: 'ResearchOS' });
    const home = canvas.getByRole('link', { name: 'Trang chủ' });
    const more = canvas.getByRole('button', { name: 'Thêm' });
    const search = canvas.getByRole('button', { name: 'Mở tìm kiếm' });
    const account = canvas.getByRole('button', { name: /Menu tài khoản/ });
    const headerBounds = header.getBoundingClientRect();
    const brandBounds = brand.getBoundingClientRect();
    expect(brandBounds.left + brandBounds.width / 2).toBeCloseTo(
      headerBounds.left + headerBounds.width / 2,
    );
    expect(brandBounds.bottom).toBeLessThan(home.getBoundingClientRect().top);
    expect(search.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      more.getBoundingClientRect().right,
    );
    expect(account.getBoundingClientRect().right).toBeLessThanOrEqual(
      headerBounds.right,
    );
    await expect(home).toHaveAttribute('aria-current', 'page');
    await expect(canvas.queryByRole('button', { name: 'Thêm mới' })).toBeNull();

    await userEvent.click(search);
    const searchPanel = within(
      await body.findByRole('dialog', { name: 'Tìm kiếm' }),
    );
    await waitFor(() =>
      expect(
        searchPanel.getByRole('searchbox', { name: 'Tìm kiếm' }),
      ).toBeVisible(),
    );
    await userEvent.keyboard('{Escape}');

    await userEvent.click(more);
    const menu = within(await body.findByRole('menu', { name: 'Thêm' }));
    await userEvent.click(menu.getByRole('menuitem', { name: 'Thêm mới' }));
    const drawer = await body.findByRole('dialog', {
      name: 'Thêm công trình của bạn',
    });
    await waitFor(() => expect(drawer).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(more).toHaveFocus());
  },
};
