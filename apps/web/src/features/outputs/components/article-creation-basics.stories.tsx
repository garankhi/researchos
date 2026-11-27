import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, mocked, waitFor, within } from 'storybook/test';
import { AddResearchDrawer } from '@/features/identity';
import type { ArticlePdfReader } from '../hooks/use-article-pdf-preview';
import { ArticleCreationBasics } from './article-creation-basics';

const suggestions = {
  title: 'Title from the PDF',
  publicationDate: '2025-11',
  authorNames: ['Minh An'],
};

// Only Storybook supplies simulated uploads and accounts.
const reader: ArticlePdfReader = {
  async verify(_file, signal, progress) {
    progress(35);
    await new Promise((resolve) => setTimeout(resolve, 350));
    signal.throwIfAborted();
    progress(100);
    return '11fd02c7-ac84-48ee-820f-092def668dce';
  },
  async readMetadata(_id, signal) {
    signal.throwIfAborted();
    return suggestions;
  },
};
const meta = {
  title: 'Outputs/Article creation/First steps',
  component: ArticleCreationBasics,
  parameters: { layout: 'fullscreen' },
  args: {
    reader,
    accounts: [
      {
        displayName: 'Minh An',
        userId: '73300f56-725f-441e-90b5-de66578dc2e1',
      },
    ],
    scope: { scopeType: 'PERSONAL' },
    onScopeChange: fn(),
    onContinue: fn(),
  },
} satisfies Meta<typeof ArticleCreationBasics>;
export default meta;
type Story = StoryObj<typeof meta>;
type Play = Parameters<NonNullable<Story['play']>>[0];
const continueAction = { name: /^(Continue|Tiếp tục)$/ };
const readingMessage =
  /Reading information from the PDF|Đang đọc thông tin từ PDF/;

async function selectPdf(
  { canvas, canvasElement, userEvent }: Play,
  fileName = 'research-notes.pdf',
) {
  const input =
    canvasElement.querySelector<HTMLInputElement>('input[type=file]')!;
  await userEvent.upload(
    input,
    new File(['%PDF-1.7\n', new Uint8Array(4096)], fileName, {
      type: 'application/pdf',
    }),
  );
  await canvas.findByRole('radiogroup', {
    name: /Choose how to share this file|Chọn cách chia sẻ tệp/,
  });
}

async function uploadPrivatePdf(context: Play, fileName?: string) {
  await selectPdf(context, fileName);
  const { canvas, userEvent } = context;
  const upload = canvas.getByRole('button', {
    name: /^(Upload PDF|Tải tệp lên)$/,
  });
  await userEvent.click(
    canvas.getByRole('radio', { name: /Private|Riêng tư/ }),
  );
  await userEvent.click(canvas.getByRole('checkbox'));
  await userEvent.click(upload);
}
export const ChoosePdf: Story = {};
export const FromDrawer: Story = {
  render: function DrawerPreview(args) {
    const [selected, setSelected] = useState(false);
    return selected ? (
      <ArticleCreationBasics {...args} />
    ) : (
      <AddResearchDrawer onSelectArticle={() => setSelected(true)} />
    );
  },
};
export const ManualEntry: Story = {
  render: FromDrawer.render,
  args: { onSuggestionTitleChange: fn() },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: /Add new|Thêm mới/i }),
    );
    const drawer = within(
      await within(canvasElement.ownerDocument.body).findByRole('dialog'),
    );
    await userEvent.click(
      drawer.getByRole('button', {
        name: /Published research|Công trình đã xuất bản/i,
      }),
    );
    await userEvent.click(
      drawer.getByRole('button', { name: /^(Article|Bài báo)$/ }),
    );
    await expect(
      await canvas.findByRole('heading', { name: /PDF/ }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Skip|Bỏ qua)$/ }),
    );
    const title = canvas.getByRole('textbox', { name: /^(Title|Tiêu đề)/ });
    await userEvent.type(title, 'Water quality in the Mekong Delta');
    await expect(args.onSuggestionTitleChange).not.toHaveBeenCalledWith(
      'Water quality in the Mekong Delta',
    );
    const next = canvas.getByRole('button', { name: /^(Continue|Tiếp tục)$/ });
    await userEvent.click(next);
    await expect(args.onSuggestionTitleChange).toHaveBeenLastCalledWith(
      'Water quality in the Mekong Delta',
    );
    await expect(args.onContinue).not.toHaveBeenCalled();
    await expect(
      canvas.getByText(/Confirm at least one author|ít nhất một tác giả/i),
    ).toBeVisible();
    const authors = canvas.getByPlaceholderText(/Enter a name|Nhập tên/);
    await userEvent.type(authors, 'Lan Nguyen');
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Add name|Thêm tên)$/ }),
    );
    await userEvent.type(authors, 'Minh');
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Select account|Chọn tài khoản)/ }),
    );
    await userEvent.type(
      canvas.getByRole('textbox', { name: /^(Year|Năm)$/ }),
      '2025',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Continue|Tiếp tục)$/ }),
    );
    await expect(args.onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationDate: '2025',
        authors: [{ displayName: 'Lan Nguyen' }, args.accounts[0]],
      }),
    );
  },
};
export const PdfVisibility: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    await selectPdf(context);
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(canvas.getByText('research-notes.pdf')).toBeVisible();
    const upload = canvas.getByRole('button', {
      name: /^(Upload PDF|Tải tệp lên)$/,
    });
    const publicOption = canvas.getByRole('radio', {
      name: /Public within|Công khai/,
    });
    const privateOption = canvas.getByRole('radio', {
      name: /Private|Riêng tư/,
    });
    await expect(upload).toBeDisabled();
    await userEvent.click(publicOption);
    await userEvent.click(privateOption);
    await expect(publicOption).not.toBeChecked();
    await expect(privateOption).toBeChecked();
    await expect(privateOption.closest('label')).toHaveStyle({
      backgroundColor: 'rgb(0, 109, 217)',
      color: 'rgb(255, 255, 255)',
      borderRadius: '9999px',
    });
    await expect(upload).toBeDisabled();
    await userEvent.click(canvas.getByRole('checkbox'));
    await expect(upload).toBeEnabled();
  },
};

export const ReadingPdf: Story = {
  args: {
    reader: {
      ...reader,
      readMetadata: (_id, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve(null), { once: true });
        }),
    },
  },
  play: async (context) => {
    await uploadPrivatePdf(context);
    await waitFor(() =>
      expect(context.canvas.getByRole('status')).toHaveTextContent(
        readingMessage,
      ),
    );
    const spinner = context.canvasElement.querySelector('.chakra-spinner');
    await expect(spinner).toHaveStyle({ borderRadius: '50%' });
    await expect(spinner?.parentElement).toHaveTextContent(/^$/);
    await expect(
      context.canvas.queryByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).not.toBeInTheDocument();
  },
};

export const ReadyToContinue: Story = {
  play: async (context) => {
    await uploadPrivatePdf(context);
    await expect(
      await context.canvas.findByRole('button', continueAction),
    ).toBeEnabled();
    await expect(
      context.canvas.queryByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).not.toBeInTheDocument();
  },
};

export const PdfSummary: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    await uploadPrivatePdf(context);
    await userEvent.click(await canvas.findByRole('button', continueAction));
    await expect(canvas.getByText('research-notes.pdf')).toBeVisible();
    await expect(canvas.getByText(/^4 KiB$/)).toBeVisible();
  },
};

export const VerifiedPdf: Story = {
  args: {
    reader: {
      verify: fn(reader.verify),
      readMetadata: fn(reader.readMetadata),
    },
    onSuggestionTitleChange: fn(),
  },
  play: async (context) => {
    const { args, canvas, userEvent } = context;
    const result = Promise.withResolvers<typeof suggestions>();
    mocked(args.reader.readMetadata).mockImplementationOnce(
      () => result.promise,
    );
    await uploadPrivatePdf(context);
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent(readingMessage),
    );
    await expect(
      canvas.queryByRole('button', continueAction),
    ).not.toBeInTheDocument();
    result.resolve(suggestions);

    const continueWithFile = await canvas.findByRole('button', continueAction);
    await expect(args.onSuggestionTitleChange).not.toHaveBeenCalledWith(
      suggestions.title,
    );
    await expect(
      canvas.queryByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText('research-notes.pdf')).toBeVisible();
    const fileSize = canvas.getByText(/^[\d.,]+ KiB$/);
    await expect(fileSize).toBeVisible();
    const sizeBeforeContinue = fileSize.textContent;
    await userEvent.click(continueWithFile);

    const title = await canvas.findByRole('textbox', {
      name: /^(Title|Tiêu đề)/,
    });
    await expect(title).toHaveValue(suggestions.title);
    await expect(args.onSuggestionTitleChange).toHaveBeenLastCalledWith(
      suggestions.title,
    );
    await expect(canvas.getByText('Minh An')).toBeVisible();
    await expect(
      canvas.getByRole('combobox', { name: /^(Month|Tháng)$/ }),
    ).toHaveValue('11');
    await expect(
      canvas.getByRole('textbox', { name: /^(Year|Năm)$/ }),
    ).toHaveValue('2025');
    await expect(
      canvas.getByRole('combobox', { name: /^(Day|Ngày)$/ }),
    ).toHaveValue('');
    await expect(canvas.getByText('research-notes.pdf')).toBeVisible();
    await expect(canvas.getByText(/^[\d.,]+ KiB$/)).toHaveTextContent(
      sizeBeforeContinue ?? '',
    );
    await expect(
      canvas.queryByRole('button', { name: /Replace PDF|Thay tệp PDF/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /Remove file|Gỡ tệp/ }),
    ).not.toBeInTheDocument();

    await userEvent.clear(title);
    await userEvent.type(title, 'My reviewed title');
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Back|Quay lại)$/ }),
    );
    await expect(
      canvas.getByRole('button', { name: /Remove file|Gỡ tệp/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: /Replace PDF|Thay tệp PDF/ }),
    ).toBeVisible();
    await selectPdf(context, 'replacement.pdf');
    await expect(canvas.getByText('replacement.pdf')).toBeVisible();
    await expect(
      canvas.queryByRole('button', continueAction),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: /Remove file|Gỡ tệp/ }),
    );
    await expect(canvas.getByText('research-notes.pdf')).toBeVisible();
    await expect(canvas.queryByRole('radio')).not.toBeInTheDocument();

    const replacementId = '11fd02c7-ac84-48ee-820f-092def668dcf';
    mocked(args.reader.verify).mockResolvedValueOnce(replacementId);
    mocked(args.reader.readMetadata).mockResolvedValueOnce({
      title: 'Title from the replacement',
      authorNames: ['Mai Nguyen'],
      publicationDate: '2024',
    });
    await uploadPrivatePdf(context, 'replacement.pdf');
    await userEvent.click(await canvas.findByRole('button', continueAction));
    await expect(
      await canvas.findByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).toHaveValue('My reviewed title');
    await expect(canvas.getByText('replacement.pdf')).toBeVisible();
    await expect(canvas.getByText('Mai Nguyen')).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Continue|Tiếp tục)$/ }),
    );
    await expect(args.onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My reviewed title',
        fileVisibility: 'PRIVATE',
        uploadId: replacementId,
        publicationDate: '2024',
      }),
    );
  },
};

export const ContinueWhileWaiting: Story = {
  args: { reader: { ...reader, readMetadata: fn(reader.readMetadata) } },
  play: async (context) => {
    const { args, canvas, userEvent } = context;
    const result = Promise.withResolvers<typeof suggestions>();
    mocked(args.reader.readMetadata).mockImplementationOnce(
      () => result.promise,
    );
    await uploadPrivatePdf(context);
    await expect(
      canvas.queryByRole('button', continueAction),
    ).not.toBeInTheDocument();
    const continueWhileWaiting = await canvas.findByRole(
      'button',
      continueAction,
      {
        timeout: 7000,
      },
    );
    await expect(canvas.getByRole('status')).toHaveTextContent(
      /Still looking for suggestions|Đang chờ gợi ý/,
    );
    await expect(
      canvas.queryByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(continueWhileWaiting);
    const title = await canvas.findByRole('textbox', {
      name: /^(Title|Tiêu đề)/,
    });
    await userEvent.type(title, 'My reviewed title');
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Back|Quay lại)$/ }),
    );
    result.resolve(suggestions);
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent(
        /PDF suggestions are ready|Đã có gợi ý từ PDF/,
      ),
    );
    await expect(
      canvas.queryByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', continueAction));
    await expect(
      await canvas.findByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).toHaveValue('My reviewed title');
    await expect(
      canvas.getByRole('textbox', { name: /^(Year|Năm)$/ }),
    ).toHaveValue('2025');
    await expect(canvas.getByText('research-notes.pdf')).toBeVisible();
  },
};

export const AbstractOnlyPdf: Story = {
  args: {
    reader: {
      ...reader,
      async readMetadata() {
        return { abstract: 'An example abstract.' };
      },
    },
    onSuggestedAbstractChange: fn(),
  },
  play: async (context) => {
    await uploadPrivatePdf(context);
    await context.userEvent.click(
      await context.canvas.findByRole('button', continueAction),
    );
    const title = await context.canvas.findByRole('textbox', {
      name: /^(Title|Tiêu đề)/,
    });
    await expect(title).toHaveValue('');
    await expect(context.canvas.getByRole('status')).toHaveTextContent(
      /Review it in Add details|bước Chi tiết bổ sung/,
    );
    await expect(
      context.args.onSuggestedAbstractChange,
    ).toHaveBeenLastCalledWith('An example abstract.');
  },
};

export const UploadRetry: Story = {
  args: {
    reader: {
      ...reader,
      verify: fn(reader.verify),
      async readMetadata() {
        return null;
      },
    },
  },
  play: async (context) => {
    const { args, canvas, userEvent } = context;
    mocked(args.reader.verify).mockRejectedValueOnce(
      new Error('Upload failed'),
    );
    await uploadPrivatePdf(context);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      /could not be uploaded|Chưa tải lên/,
    );
    await expect(
      canvas.queryByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: /^(Retry|Thử lại)$/ }),
    );
    await userEvent.click(await canvas.findByRole('button', continueAction));
    await expect(
      await canvas.findByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).toHaveValue('');
    await expect(canvas.getByRole('status')).toHaveTextContent(
      /enter the article information manually|nhập thông tin bài báo thủ công/,
    );
    await expect(canvas.getByText('research-notes.pdf')).toBeVisible();
  },
};
