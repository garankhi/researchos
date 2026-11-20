import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import { OpportunityOverview } from './opportunity-overview';
import { OpportunitySidebar } from './opportunity-sidebar';
import type { Opportunity } from '../types';

const opportunity: Opportunity = {
  id: 'opportunity-1',
  groupId: 'group-1',
  projectId: null,
  creatorId: 'researcher-1',
  title: 'Postdoctoral position in quantum optics',
  opportunityKind: 'RESEARCH_COLLABORATION',
  targetAudience: 'ANY_RESEARCHER',
  expectedRole:
    'Lead the experimental setup and co-author the resulting publications.',
  requiredExpertiseTags: ['Quantum optics', 'Photonics'],
  description:
    'Our group is looking for a researcher to join an ongoing experimental programme on coupled optical resonators.',
  responseSlaDays: 14,
  applicationDeadline: '2026-12-31T23:59:00.000Z',
  status: 'OPEN',
  publishedAt: '2026-11-01T09:00:00.000Z',
  archivedAt: null,
  canManage: false,
};

const meta = {
  title: 'Opportunities/Detail',
  component: OpportunityOverview,
  decorators: [
    (Story) => (
      <SnackbarProvider>
        <Story />
      </SnackbarProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof OpportunityOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  args: { opportunity },
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'About this opportunity' }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        'Our group is looking for a researcher to join an ongoing experimental programme on coupled optical resonators.',
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole('heading', { name: 'Expected role' }),
    ).toBeVisible();
    await expect(canvas.getByText('Quantum optics')).toBeVisible();
  },
};

export const Sidebar: Story = {
  args: { opportunity },
  render: () => (
    <OpportunitySidebar opportunity={opportunity} groupName="Photonics Lab" />
  ),
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Details' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Photonics Lab' }),
    ).toHaveAttribute('href', '/en/groups/group-1');
  },
};

export const WithoutGroup: Story = {
  args: {
    opportunity: { ...opportunity, groupId: null },
  },
  render: () => (
    <OpportunitySidebar
      opportunity={{ ...opportunity, groupId: null }}
      groupName={undefined}
    />
  ),
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole('link', { name: 'View the group' }),
    ).toBeNull();
  },
};
