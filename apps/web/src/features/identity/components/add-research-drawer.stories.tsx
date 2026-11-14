import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AddResearchDrawer } from './add-research-drawer';

const meta = {
  title: 'Identity/Add research',
  component: AddResearchDrawer,
} satisfies Meta<typeof AddResearchDrawer>;

export default meta;

export const Drawer: StoryObj<typeof meta> = {
  globals: { locale: 'en', colorMode: 'light' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Add new' });
    const page = within(canvasElement.ownerDocument.body);
    const location = canvasElement.ownerDocument.location;
    const initialUrl = location.href;
    await expect(trigger).toHaveStyle({ borderRadius: '9999px' });
    await userEvent.click(trigger);
    const drawer = await page.findByRole('dialog', {
      name: 'Add your research',
    });
    await expect(drawer).toHaveStyle({ borderRadius: '0px' });
    expect(window.getComputedStyle(drawer).boxShadow).not.toBe('none');
    const backdrop = canvasElement.ownerDocument.querySelector(
      '[data-scope="dialog"][data-part="backdrop"]',
    );
    await expect(backdrop).toHaveStyle({
      backgroundColor: 'rgba(232, 232, 232, 0.92)',
    });

    for (const name of [
      /Published research/,
      /Preprint/,
      /Conference paper/,
      /Presentation/,
      /Poster/,
      /Data/,
      /Other/,
    ]) {
      const option = within(drawer).getByRole('button', { name });
      await expect(option).toBeEnabled();
      await userEvent.click(option);
      await expect(drawer).toBeVisible();
      expect(location.href).toBe(initialUrl);
    }

    await userEvent.keyboard('{Escape}');
    await expect(trigger).toHaveFocus();
  },
};
