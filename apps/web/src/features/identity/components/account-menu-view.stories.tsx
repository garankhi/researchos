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

/**
 * The menu holds more than one item, so an item is addressed by its label
 * rather than by its role alone.
 */
function menuItem(container: HTMLElement, name: string) {
  return within(container).getByRole('menuitem', { name });
}

export const KeyboardNavigation: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', {
      name: new RegExp(args.user.fullName),
    });

    async function openMenuWithKeyboard() {
      await userEvent.keyboard('{Enter}');
      const menu = await body.findByRole('menu');
      const first = within(menu).getAllByRole('menuitem')[0];
      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(menu).toHaveFocus();
        expect(menu).toHaveAttribute('aria-activedescendant', first.id);
      });
    }

    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await openMenuWithKeyboard();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(body.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    await expect(args.onLogout).not.toHaveBeenCalled();

    await openMenuWithKeyboard();

    // The focus starts on the first item, so the logout item is reached
    // with one more key press.
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(args.onLogout).toHaveBeenCalledTimes(1));
  },
};

export const SigningOut: Story = {
  args: { isLoggingOut: true },
  globals: { locale: 'en', colorMode: 'dark', viewport: { value: 'mobile1' } },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: new RegExp(args.user.fullName) }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await body.findByRole('menu');

    await expect(
      menuItem(canvasElement.ownerDocument.body, 'Log out'),
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(args.onLogout).not.toHaveBeenCalled();
  },
};
