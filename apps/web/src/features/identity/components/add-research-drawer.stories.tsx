import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
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

export const PublishedResearch: StoryObj<typeof meta> = {
  args: { onSelectArticle: fn() },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: /Add new|Thêm mới/ });
    const categoryName = /Published research|Công trình đã xuất bản/;
    const mainName = /Add your research|Thêm công trình của bạn/;
    await userEvent.click(trigger);
    const main = await page.findByRole('dialog', { name: mainName });
    await userEvent.click(
      within(main).getByRole('button', { name: categoryName }),
    );
    const publications = within(
      await page.findByRole('dialog', { name: categoryName }),
    );
    const back = publications.getByRole('button', { name: /Go back|Quay lại/ });
    await expect(back).toHaveFocus();
    await expect(publications.getByRole('heading')).toHaveStyle({
      position: 'absolute',
    });
    await expect(
      publications.queryByRole('button', { name: /Preprint|Bản tiền ấn phẩm/ }),
    ).not.toBeInTheDocument();
    const article = publications.getByRole('button', {
      name: /^(Article|Bài báo)$/,
    });
    await expect(article).toBeVisible();
    await expect(article.querySelector('svg')).toBeNull();

    const chevron = back.previousElementSibling;
    if (!chevron) throw new Error('The Back button needs a separate chevron.');
    await expect(chevron).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(chevron);
    await expect(article).toBeVisible();
    await userEvent.click(back);
    const categories = within(
      await page.findByRole('dialog', { name: mainName }),
    );
    await expect(
      categories.getByRole('button', { name: categoryName }),
    ).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await page.findByRole('dialog', { name: categoryName });
    await userEvent.keyboard('{Escape}');
    await expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    const reopened = within(
      await page.findByRole('dialog', { name: mainName }),
    );
    await userEvent.click(reopened.getByRole('button', { name: categoryName }));
    await page.findByRole('dialog', { name: categoryName });
  },
};
