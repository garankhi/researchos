import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { AccountMenuView } from './account-menu-view';

const meta = {
  title: 'Identity/Account menu',
  component: AccountMenuView,
  args: {
    user: {
      fullName: 'Nguyễn Minh Anh',
      email: 'minh.anh@example.test',
    },
    isLoggingOut: false,
    onLogout: fn(),
  },
} satisfies Meta<typeof AccountMenuView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

export const KeyboardNavigation: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', {
      name: new RegExp(args.user.fullName),
    });

    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    const menu = await body.findByRole('menu');
    const logout = within(menu).getByRole('menuitem');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toHaveFocus();
    await expect(menu).toHaveAttribute('aria-activedescendant', logout.id);

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(body.queryByRole('menu')).not.toBeInTheDocument(),
    );
    await expect(trigger).toHaveFocus();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(args.onLogout).not.toHaveBeenCalled();

    await userEvent.keyboard('{Enter}');
    const reopenedMenu = await body.findByRole('menu');
    await expect(reopenedMenu).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onLogout).toHaveBeenCalledTimes(1);
  },
};

export const SigningOut: Story = {
  args: { isLoggingOut: true },
  globals: { locale: 'en', colorMode: 'dark', viewport: { value: 'mobile1' } },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: new RegExp(args.user.fullName) }),
    );
    const menu = await within(canvasElement.ownerDocument.body).findByRole(
      'menu',
    );

    await expect(within(menu).getByRole('menuitem')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(args.onLogout).not.toHaveBeenCalled();
  },
};
