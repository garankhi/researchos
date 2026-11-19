import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { QueryProvider } from '@/components/providers/query-provider';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import en from '@/messages/en.json';
import vi from '@/messages/vi.json';
import { GroupMembers } from './group-members';

const groupId = '10000000-0000-4000-8000-000000000001';
const leadId = '10000000-0000-4000-8000-000000000002';
const query = {
  data: [
    {
      groupId,
      userId: leadId,
      role: 'GROUP_LEADER' as const,
      joinedAt: '2026-11-15T00:00:00Z',
      fullName: 'Sample Researcher',
      email: 'researcher@example.test',
      departmentUnit: 'Computing',
      academicTitle: null,
      academicDegree: 'PhD',
      userType: 'FACULTY',
      avatarStorageKey: null,
      bio: 'Research in human-centered computing.',
    },
  ],
  isPending: false,
  isError: false,
  error: null,
  refetch: fn(),
};

const meta = {
  title: 'Groups/Member roster',
  component: GroupMembers,
  decorators: [
    (Story) => (
      <QueryProvider>
        <SnackbarProvider>
          <Story />
        </SnackbarProvider>
      </QueryProvider>
    ),
  ],
  args: { groupId, leadId, active: true, canManage: false, query },
} satisfies Meta<typeof GroupMembers>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ManagementActions: Story = {
  args: { canManage: true, leadId: 'another-lead' },
  play: async ({ canvas, userEvent, globals }) => {
    const t = (globals.locale === 'en' ? en : vi).groups;
    const body = within(document.body);
    await expect(
      canvas.queryByRole('button', { name: t.changeRole }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: t.actions }));
    await userEvent.click(
      await body.findByRole('menuitem', { name: t.changeRole }),
    );
    const editor = await body.findByRole('dialog', {
      name: t.changeRole,
    });
    await userEvent.selectOptions(
      within(editor).getByRole('combobox'),
      'MEMBER',
    );
    await userEvent.click(
      within(editor).getByRole('button', { name: t.cancel }),
    );
    await userEvent.click(canvas.getByRole('button', { name: t.actions }));
    const items = await body.findAllByRole('menuitem');
    await expect(items.at(-1)).toHaveTextContent(t.removeMember);
    await userEvent.click(body.getByRole('menuitem', { name: t.removeMember }));
    const confirmation = await body.findByRole('alertdialog', {
      name: t.removeMember,
    });
    await userEvent.click(
      within(confirmation).getByRole('button', { name: t.cancel }),
    );
    await expect(
      canvas.getByRole('link', { name: 'Sample Researcher' }),
    ).toBeVisible();
  },
};

export const ReadonlyRoster: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('link', { name: 'Sample Researcher' }),
    ).toBeVisible();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { query: { ...query, data: undefined, isPending: true } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByTestId('loading-skeleton')).toHaveLength(2);
  },
};

export const EmptyRoster: Story = {
  args: { query: { ...query, data: [] } },
};

export const MoreMembersAvailable: Story = {
  args: {
    query: {
      ...query,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: fn(),
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'));
    await expect(args.query.fetchNextPage).toHaveBeenCalledTimes(1);
  },
};

export const FailedRoster: Story = {
  args: {
    query: {
      ...query,
      data: undefined,
      isError: true,
      error: new Error('Synthetic failure'),
      refetch: fn(),
    },
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'));
    await expect(args.query.refetch).toHaveBeenCalledTimes(1);
  },
};
