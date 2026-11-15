import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThemeProvider } from 'next-themes';
import { expect, waitFor, within } from 'storybook/test';
import { DisplaySettings } from './display-settings';

const meta = {
  title: 'Shared/Display settings',
  component: DisplaySettings,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        storageKey="researchos-storybook-theme"
      >
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof DisplaySettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Open settings' });
    const document = canvasElement.ownerDocument;
    const page = within(document.body);

    await expect(trigger).toHaveStyle({ position: 'fixed' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const settings = await page.findByRole('dialog', { name: 'Open settings' });
    const options = within(settings);
    await expect(
      options.getByRole('button', { name: 'English' }),
    ).toHaveAttribute('aria-pressed', 'true');
    options.getByRole('button', { name: 'Dark mode' }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const reopened = within(
      await page.findByRole('dialog', { name: 'Open settings' }),
    );
    await expect(
      reopened.getByRole('button', { name: 'Dark mode' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      reopened.getByRole('button', { name: 'Light mode' }),
    ).toHaveAttribute('aria-pressed', 'false');
  },
};
