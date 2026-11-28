import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getRouter } from '@storybook/nextjs-vite/navigation.mock';
import { AxiosError } from 'axios';
import { expect, fn, waitFor, within } from 'storybook/test';
import { QueryProvider } from '@/components/providers/query-provider';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import { AXIOS_INSTANCE } from '@/lib/axios-instance';
import en from '@/messages/en.json';
import { CreateGroupButton } from './create-group-button';

const groupId = '10000000-0000-4000-8000-000000000001';
const postGroup = fn();

function mockCreateGroup(duplicate = false) {
  postGroup.mockClear();
  const interceptor = AXIOS_INSTANCE.interceptors.request.use((config) => {
    if (config.url !== '/research-groups' || config.method !== 'post')
      return config;
    config.adapter = async (request) => {
      postGroup(JSON.parse(request.data as string));
      if (duplicate) {
        throw new AxiosError('Conflict', undefined, request, undefined, {
          config: request,
          status: 409,
          statusText: 'Conflict',
          headers: {},
          data: { success: false, message: 'group_code_already_exists' },
        });
      }
      return {
        config: request,
        status: 201,
        statusText: 'Created',
        headers: {},
        data: { success: true, data: { id: groupId } },
      };
    };
    return config;
  });
  return () => AXIOS_INSTANCE.interceptors.request.eject(interceptor);
}

const meta = {
  title: 'Groups/Create group',
  component: CreateGroupButton,
  globals: { locale: 'en' },
  parameters: {
    nextjs: { navigation: { pathname: '/en/profile/my-profile' } },
  },
  decorators: [
    (Story) => (
      <QueryProvider>
        <SnackbarProvider>
          <Story />
        </SnackbarProvider>
      </QueryProvider>
    ),
  ],
} satisfies Meta<typeof CreateGroupButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreatesAndOpensGroup: Story = {
  beforeEach: () => mockCreateGroup(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const t = en.groups;
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: t.newGroup }));
    const dialog = within(
      await body.findByRole('dialog', { name: t.newGroup }),
    );
    const submit = dialog.getByRole('button', { name: t.createGroup });
    const code = dialog.getByRole('textbox', { name: t.code });
    const name = dialog.getByRole('textbox', { name: t.name });

    await userEvent.click(submit);
    await expect(
      await dialog.findByText(t.createGroupValidation.group_code_required),
    ).toBeInTheDocument();
    await expect(
      await dialog.findByText(t.createGroupValidation.group_name_required),
    ).toBeInTheDocument();
    await expect(postGroup).not.toHaveBeenCalled();

    await userEvent.click(code);
    await userEvent.paste('X'.repeat(51));
    await userEvent.click(name);
    await userEvent.paste('X'.repeat(256));
    await userEvent.click(submit);
    await expect(
      await dialog.findByText(t.createGroupValidation.group_code_too_long),
    ).toBeInTheDocument();
    await expect(
      await dialog.findByText(t.createGroupValidation.group_name_too_long),
    ).toBeInTheDocument();
    await expect(postGroup).not.toHaveBeenCalled();

    await userEvent.clear(code);
    await userEvent.type(code, '  AI-LAB  ');
    await userEvent.clear(name);
    await userEvent.type(name, '  AI and Data Systems Lab  ');
    await userEvent.type(
      dialog.getByRole('textbox', { name: t.description }),
      '  Group description  ',
    );
    await userEvent.click(submit);

    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(`/en/groups/${groupId}`),
    );
    await expect(postGroup).toHaveBeenCalledTimes(1);
    await expect(postGroup).toHaveBeenCalledWith({
      code: 'AI-LAB',
      name: 'AI and Data Systems Lab',
      description: 'Group description',
    });
    await expect(await body.findByText(t.groupCreated)).toBeInTheDocument();
  },
};

export const DuplicateCode: Story = {
  beforeEach: () => mockCreateGroup(true),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const t = en.groups;
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: t.newGroup }));
    const dialog = within(
      await body.findByRole('dialog', { name: t.newGroup }),
    );
    const code = dialog.getByRole('textbox', { name: t.code });
    await userEvent.type(code, 'AI-LAB');
    await userEvent.type(
      dialog.getByRole('textbox', { name: t.name }),
      'AI and Data Systems Lab',
    );
    await userEvent.click(dialog.getByRole('button', { name: t.createGroup }));

    await expect(
      await dialog.findByText(en.errors.codes.domain.group_code_already_exists),
    ).toBeInTheDocument();
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toHaveValue('AI-LAB');
    await expect(
      dialog.queryByText(t.createGroupError),
    ).not.toBeInTheDocument();
    await expect(postGroup).toHaveBeenCalledTimes(1);
    await expect(postGroup).toHaveBeenCalledWith({
      code: 'AI-LAB',
      name: 'AI and Data Systems Lab',
    });
  },
};
