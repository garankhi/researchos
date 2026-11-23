import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { ArticleCreationSuccess } from './article-creation-success';

const meta = {
  title: 'Outputs/Article creation/Success',
  component: ArticleCreationSuccess,
  parameters: { layout: 'fullscreen' },
  args: {
    outputId: '73300f56-725f-441e-90b5-de66578dc2e1',
    addedAt: '2026-11-21T09:00:00Z',
    hasOptionalDetails: false,
    onAddMore: fn(),
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { level: 1 })).toBeVisible();
    const detailText = args.hasOptionalDetails
      ? /^(Article details added|Đã thêm thông tin bổ sung)$/
      : /^(Optional details skipped|Đã bỏ qua thông tin bổ sung)$/;
    await expect(canvas.getByText(detailText)).toBeVisible();
    const link = canvas.getByRole('link', { name: /View article|Xem bài báo/ });
    await expect(link.getAttribute('href')).toMatch(
      new RegExp(`/outputs/${args.outputId}$`),
    );
    await userEvent.click(
      canvas.getByRole('button', {
        name: /Add more research|Thêm nghiên cứu khác/,
      }),
    );
    await expect(args.onAddMore).toHaveBeenCalled();
  },
} satisfies Meta<typeof ArticleCreationSuccess>;

export default meta;
type Story = StoryObj<typeof meta>;
export const DetailsSkipped: Story = {};
export const DetailsAdded: Story = { args: { hasOptionalDetails: true } };
export const MobileVietnamese: Story = {
  globals: { locale: 'vi', viewport: { value: 'mobile1' } },
};
export const MobileEnglish: Story = {
  args: { hasOptionalDetails: true },
  globals: { locale: 'en', viewport: { value: 'mobile1' } },
};
