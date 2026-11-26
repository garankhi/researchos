import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { ArticleIllustration } from './article-illustration';

const meta = {
  title: 'Outputs/Article creation/Illustrations',
  component: ArticleIllustration,
  parameters: { layout: 'centered' },
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector('img')!;
    await image.decode();
    await expect(image.naturalWidth).toBe(256);
    await expect(image).toHaveAttribute('alt', '');
  },
} satisfies Meta<typeof ArticleIllustration>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Header: Story = { args: { kind: 'header' } };
export const Discovery: Story = { args: { kind: 'discovery' } };
export const Published: Story = { args: { kind: 'published' } };
export const PdfFile: Story = { args: { kind: 'pdf-file' } };
