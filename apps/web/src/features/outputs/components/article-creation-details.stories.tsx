import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { QueryProvider } from '@/components/providers/query-provider';
import { AddResearchDrawer } from '@/features/identity';
import type { ArticlePdfReader } from '../hooks/use-article-pdf-preview';
import { ArticleCreationBasics } from './article-creation-basics';
import { ArticleCreationDetails } from './article-creation-details';
import { ArticleCreationSuccess } from './article-creation-success';

const articleId = '73300f56-725f-441e-90b5-de66578dc2e1';
const water = {
  id: '12f85c47-e5a6-4f91-98de-2a2bb050b634',
  name: 'Water quality',
};
const hydrology = {
  id: 'e8355a6e-90dc-4eeb-9491-40adda292144',
  name: 'Hydrology',
};
const climate = {
  id: '779a0df6-bf38-43b2-a44d-c62ab5605ca5',
  name: 'Climate change',
};
const reader: ArticlePdfReader = {
  verify: async () => '11fd02c7-ac84-48ee-820f-092def668dce',
  readMetadata: async () => ({
    title: 'Water quality in the Mekong Delta',
    authorNames: ['Minh An'],
    publicationDate: '2025-11',
    abstract:
      'We assess seasonal changes in water quality in the Mekong Delta.',
  }),
};

const meta = {
  title: 'Outputs/Article creation/Additional details',
  component: ArticleCreationDetails,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <QueryProvider>
        <Story />
      </QueryProvider>
    ),
  ],
  args: {
    topics: [water, hydrology, climate],
    suggestions: [water, hydrology],
    onBack: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof ArticleCreationDetails>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SuggestedTopics: Story = {};

export const AddDetails: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('radio', {
        name: /^(Not peer-reviewed|Chưa qua bình duyệt)$/,
      }),
    );
    await userEvent.type(
      canvas.getByRole('textbox', { name: /Journal name|Tên tạp chí/ }),
      'Mekong Research',
    );
    await userEvent.click(canvas.getByRole('button', { name: water.name }));
    await userEvent.type(
      canvas.getByRole('combobox', { name: /^(Topics|Chủ đề)$/ }),
      'Climate',
    );
    await expect(
      canvas.getByRole('option', { name: climate.name }),
    ).toBeVisible();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(canvas.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', {
        name: /^(Remove topic|Gỡ chủ đề) Water quality$/,
      }),
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Add article|Thêm bài báo)$/ }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      peerReviewed: false,
      journal: 'Mekong Research',
      topicIds: [climate.id],
    });
  },
};

export const SkipDetails: Story = {
  args: { suggestedAbstract: 'Suggested abstract from the PDF' },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: water.name }));
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Skip details|Bỏ qua chi tiết)$/ }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({});
  },
};

export const SuggestionsUnavailable: Story = {
  args: { suggestions: [], suggestionsUnavailable: true },
  globals: { locale: 'vi', viewport: { value: 'mobile1' } },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Hiện chưa lấy được gợi ý',
    );
    const search = canvas.getByRole('combobox', { name: 'Chủ đề' });
    await userEvent.click(search);
    await waitFor(() =>
      expect(canvas.getByRole('option', { name: water.name })).toBeVisible(),
    );
    await userEvent.type(search, 'Hydrology');
    const option = await canvas.findByRole('option', { name: hydrology.name });
    await waitFor(() => expect(option).toBeVisible());
    await userEvent.click(option);
    await userEvent.click(canvas.getByRole('button', { name: 'Thêm bài báo' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({
      topicIds: [hydrology.id],
    });
  },
};

export const CompleteFlow: Story = {
  render: function ArticleCreationPreview(args) {
    const [step, setStep] = useState<
      'drawer' | 'basics' | 'details' | 'success'
    >('drawer');
    const [draft, setDraft] =
      useState<
        Parameters<
          React.ComponentProps<typeof ArticleCreationBasics>['onContinue']
        >[0]
      >();
    const [hasOptionalDetails, setHasOptionalDetails] = useState(false);

    if (step === 'drawer')
      return <AddResearchDrawer onSelectArticle={() => setStep('basics')} />;
    if (step === 'success')
      return (
        <ArticleCreationSuccess
          outputId={articleId}
          addedAt="2026-11-21T09:00:00Z"
          hasOptionalDetails={hasOptionalDetails}
          onAddMore={() => {
            setDraft(undefined);
            setStep('drawer');
          }}
        />
      );

    return (
      <>
        <div hidden={step !== 'basics'}>
          <ArticleCreationBasics
            reader={reader}
            accounts={[]}
            onContinue={(values) => {
              setDraft(values);
              setStep('details');
            }}
          />
        </div>
        {draft && (
          <div hidden={step !== 'details'}>
            <ArticleCreationDetails
              {...args}
              suggestedAbstract={draft.suggestedAbstract}
              onBack={() => setStep('basics')}
              onSubmit={(details) => {
                args.onSubmit(details);
                setHasOptionalDetails(Object.keys(details).length > 0);
                setStep('success');
              }}
            />
          </div>
        )}
      </>
    );
  },
};

export const FromDrawerToSuccess: Story = {
  render: CompleteFlow.render,
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: /Add new|Thêm mới/ }),
    );
    const drawer = within(
      await within(canvasElement.ownerDocument.body).findByRole('dialog'),
    );
    await userEvent.click(
      drawer.getByRole('button', {
        name: /Published research|Công trình đã xuất bản/,
      }),
    );
    await userEvent.click(
      drawer.getByRole('button', { name: /^(Article|Bài báo)$/ }),
    );
    await userEvent.click(
      await canvas.findByRole('button', { name: /^(Skip|Bỏ qua)$/ }),
    );
    await userEvent.type(
      canvas.getByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
      'Mekong Delta research',
    );
    await userEvent.type(
      canvas.getByPlaceholderText(/Enter a name|Nhập tên/),
      'Minh An',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Add name|Thêm tên)$/ }),
    );
    await userEvent.type(
      canvas.getByRole('textbox', { name: /^(Year|Năm)$/ }),
      '2025',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Continue|Tiếp tục)$/ }),
    );
    await userEvent.type(
      await canvas.findByRole('textbox', { name: /^(Abstract|Tóm tắt)$/ }),
      'Research in the Mekong Delta',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Back|Quay lại)$/ }),
    );
    await expect(
      canvas.getByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).toHaveValue('Mekong Delta research');
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Continue|Tiếp tục)$/ }),
    );
    await expect(
      await canvas.findByRole('textbox', { name: /^(Abstract|Tóm tắt)$/ }),
    ).toHaveValue('Research in the Mekong Delta');
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Skip details|Bỏ qua chi tiết)$/ }),
    );
    await expect(
      await canvas.findByRole('heading', {
        name: /Your article has been published|Đã thêm bài báo/,
      }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/Optional details skipped|Đã bỏ qua thông tin bổ sung/),
    ).toBeVisible();
    await expect(args.onSubmit).toHaveBeenCalledWith({});
  },
};
