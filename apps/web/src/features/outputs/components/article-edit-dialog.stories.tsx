import { useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Menu,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import {
  ArticleEditDialog,
  type ArticleEditValues,
} from './article-edit-dialog';
import {
  ArticlePdfManagement,
  type ManageableArticlePdf,
} from './article-pdf-management';
import { OutputAbstract } from './output-abstract';

const author = { displayName: 'Minh An', userId: 'minh-an' };
const topics = [
  { id: 'water-quality', name: 'Water quality' },
  { id: 'climate-change', name: 'Climate change' },
];
const sampleArticle: ArticleEditValues = {
  title: 'Seasonal water quality in the Mekong Delta',
  authors: [author, { displayName: 'Thanh Mai' }],
  abstract:
    'We compare water quality across sampling sites during the wet and dry seasons.',
  publicationDate: '2025-11-18',
  journal: 'Mekong Research',
  volume: '12',
  issue: '3',
  pages: '24–37',
  doi: '',
  peerReviewed: 'yes',
  topicIds: ['water-quality'],
};
const samplePdf: ManageableArticlePdf = {
  id: 'example-pdf',
  name: 'mekong-water-quality.pdf',
  size: 6_767_992,
  visibility: 'FPTU_COMMUNITY',
};

function ArticleEditPreview({
  article: initialArticle,
  pdf: initialPdf,
  openEditor = false,
}: {
  article: ArticleEditValues;
  pdf?: ManageableArticlePdf;
  openEditor?: boolean;
}) {
  const [article, setArticle] = useState(initialArticle);
  const [file, setFile] = useState(initialPdf);
  const [isEditorOpen, setIsEditorOpen] = useState(openEditor);
  const input = useRef<HTMLInputElement>(null);
  const pendingVisibility =
    useRef<ManageableArticlePdf['visibility']>('FPTU_COMMUNITY');
  const t = useTranslations('articleEdit');
  const basics = useTranslations('articleBasics');

  return (
    <Box bg="home.background" minH="100dvh" color="fg">
      <Box bg="bg.panel" borderBottomWidth="1px">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          py={{ base: '5', md: '8' }}
        >
          <Stack gap="3">
            <Badge alignSelf="start" colorPalette="blue">
              {basics('article')}
            </Badge>
            <Flex align="start" justify="space-between" gap="3">
              <Heading as="h1" size={{ base: 'lg', md: '2xl' }}>
                {article.title}
              </Heading>
              <Menu.Root>
                <Menu.Trigger asChild>
                  <Button variant="outline" size="sm" aria-label={t('actions')}>
                    <Ellipsis aria-hidden />
                  </Button>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content shadow="overlayPanel">
                      <Menu.Item
                        value="edit"
                        layerStyle="interactiveRow"
                        onSelect={() => setIsEditorOpen(true)}
                      >
                        {t('edit')}
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            </Flex>
            <Text textStyle="sm" color="fg.muted">
              {article.authors
                .map(({ displayName }) => displayName)
                .join(' · ')}
            </Text>
          </Stack>
        </Container>
      </Box>
      <Container maxW="64rem" px={{ base: '4', md: '6' }} py="6">
        <Stack gap="5" maxW="3xl">
          <Box bg="bg.panel" borderWidth="1px">
            <OutputAbstract
              abstract={article.abstract || null}
              onSaveAbstract={(abstract) =>
                setArticle((current) => ({ ...current, abstract }))
              }
            />
          </Box>
          <Stack gap="2">
            <Heading as="h2" size={{ base: 'sm', md: 'md' }}>
              {t('fullText')}
            </Heading>
            <ArticlePdfManagement
              file={file}
              onPickFile={(visibility) => {
                pendingVisibility.current = visibility;
                input.current?.click();
              }}
              onChangeVisibility={(_fileId, visibility) =>
                setFile((current) => current && { ...current, visibility })
              }
              onRemove={() => setFile(undefined)}
            />
            <Input
              type="file"
              ref={input}
              hidden
              aria-label={basics('select')}
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                event.target.value = '';
                if (!selected) return;
                setFile({
                  id: selected.name,
                  name: selected.name,
                  size: selected.size,
                  visibility: pendingVisibility.current,
                });
              }}
            />
          </Stack>
        </Stack>
      </Container>
      <ArticleEditDialog
        open={isEditorOpen}
        article={article}
        accounts={[author]}
        topics={topics}
        onClose={() => setIsEditorOpen(false)}
        onSave={(values) => {
          setArticle(values);
          setIsEditorOpen(false);
        }}
      />
    </Box>
  );
}

const meta = {
  title: 'Outputs/Article editing',
  component: ArticleEditPreview,
  parameters: { layout: 'fullscreen' },
  args: { article: sampleArticle, pdf: samplePdf },
} satisfies Meta<typeof ArticleEditPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

const editDialogName = /^(Edit article details|Chỉnh sửa thông tin bài báo)$/;
const manageDialogName = /^(Manage full-text PDF|Quản lý PDF toàn văn)$/;

export const EditDetails: Story = {
  args: { openEditor: true },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await page.findByRole('dialog', { name: editDialogName }),
    );
    const save = dialog.getByRole('button', { name: /^(Save|Lưu)$/ });
    await expect(save).toBeDisabled();
    const title = dialog.getByRole('textbox', { name: /^(Title|Tiêu đề)/ });
    await expect(title).toHaveValue(sampleArticle.title);
    const year = dialog.getByRole('textbox', { name: /^(Year|Năm)$/ });
    const month = dialog.getByRole('combobox', { name: /^(Month|Tháng)$/ });
    for (const field of [title, year, month]) {
      field.focus();
      const style = getComputedStyle(field);
      await expect(style.borderBottomColor).toBe('rgb(0, 109, 217)');
      await expect(style.boxShadow).toContain('0px -1px 0px 0px inset');
      await expect(style.outlineStyle).toBe('none');
      await expect(style.backgroundImage).toBe('none');
    }
    await userEvent.type(title, ' revised');
    await expect(save).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      page.getByRole('button', {
        name: /^(Article actions|Thao tác với bài báo)$/,
      }),
    );
    await userEvent.click(
      await page.findByRole('menuitem', {
        name: /^(Edit article|Chỉnh sửa bài báo)$/,
      }),
    );
    const reopened = within(
      await page.findByRole('dialog', { name: editDialogName }),
    );
    await expect(
      reopened.getByRole('textbox', { name: /^(Title|Tiêu đề)/ }),
    ).toHaveValue(sampleArticle.title);
  },
};

const addAbstractAction = { name: /^(Add an abstract|Thêm tóm tắt)$/ };
const abstractCard = { name: /^(Add an abstract|Thêm tóm tắt)/ };
const abstractField = { name: /^(Abstract|Tóm tắt)$/ };

export const AddAbstract: Story = {
  args: { article: { ...sampleArticle, abstract: '' } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const add = canvas.getByRole('button', abstractCard);
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(add);
    const dialog = within(await page.findByRole('dialog', addAbstractAction));
    const abstract = dialog.getByRole('textbox', abstractField);
    await userEvent.type(abstract, 'Draft abstract');
    await userEvent.click(
      dialog.getByRole('button', { name: /^(Cancel|Huỷ|Hủy)$/ }),
    );
    await waitFor(() => expect(add).toHaveFocus());
    await userEvent.click(add);
    const reopened = within(await page.findByRole('dialog', addAbstractAction));
    await expect(reopened.getByRole('textbox', abstractField)).toHaveValue('');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(add).toHaveFocus());
  },
};

export const AddAbstractPopup: Story = {
  args: AddAbstract.args,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', abstractCard));
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole('dialog', addAbstractAction));
    const abstract = dialog.getByRole('textbox', abstractField);
    await waitFor(() => expect(abstract).toHaveFocus());
    const focusedStyle = getComputedStyle(abstract);
    await expect(focusedStyle.borderBottomColor).toBe('rgb(0, 109, 217)');
    await expect(focusedStyle.boxShadow).toContain('0px -1px 0px 0px inset');
    await expect(focusedStyle.outlineStyle).toBe('none');
    await expect(focusedStyle.borderTopColor).toBe('rgba(0, 0, 0, 0)');
    await expect(getComputedStyle(abstract).backgroundImage).toContain(
      'radial-gradient',
    );
    await expect(dialog.getAllByRole('textbox')).toHaveLength(1);
    const save = dialog.getByRole('button', { name: /^(Save|Lưu)$/ });
    await userEvent.type(abstract, '  ');
    await expect(getComputedStyle(abstract).backgroundImage).toBe('none');
    await expect(save).toBeDisabled();
    await userEvent.type(abstract, 'Draft abstract');
    await expect(save).toBeEnabled();
    await userEvent.clear(abstract);
  },
};

export const AddPdf: Story = {
  args: { pdf: undefined },
  globals: { viewport: { value: 'mobile1' } },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole('button', {
        name: /Add a PDF for FPTU members|Thêm PDF cho cộng đồng FPTU/,
      }),
    ).toBeVisible();
    const publicTab = canvas.getByRole('tab', {
      name: /Public within FPTU|Công khai trong FPTU/,
    });
    const tabLabel = within(publicTab).getByText(
      /Public within FPTU|Công khai trong FPTU/,
    );
    const tabRect = publicTab.getBoundingClientRect();
    const labelRect = tabLabel.getBoundingClientRect();
    await expect(labelRect.top).toBeGreaterThanOrEqual(tabRect.top);
    await expect(labelRect.bottom).toBeLessThanOrEqual(tabRect.bottom);
    await publicTab.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(
      await canvas.findByRole('button', {
        name: /Add a private PDF|Thêm PDF riêng tư/,
      }),
    ).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() =>
      expect(publicTab).toHaveAttribute('aria-selected', 'true'),
    );
  },
};

export const ManagePdf: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: /^(PDF actions|Thao tác với PDF)$/ }),
    );
    await userEvent.click(
      await page.findByRole('menuitem', {
        name: /Change access or remove PDF|Đổi quyền hoặc gỡ PDF/,
      }),
    );
    const dialog = within(
      await page.findByRole('dialog', { name: manageDialogName }),
    );
    await waitFor(() => expect(dialog.getByText(samplePdf.name)).toBeVisible());
    await expect(
      dialog.getByRole('button', { name: /^(Confirm|Xác nhận)$/ }),
    ).toBeDisabled();
    await userEvent.click(
      dialog.getByText(/^(Make PDF private|Chuyển PDF sang riêng tư)$/),
    );
    await expect(
      dialog.getByRole('button', {
        name: /^(Make PDF private|Chuyển PDF sang riêng tư)$/,
      }),
    ).toBeEnabled();
  },
};
