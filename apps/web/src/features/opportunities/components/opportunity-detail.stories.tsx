import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import { OpportunityApplications } from './opportunity-applications';
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

/**
 * One application, with the applicant display fields the API joins in.
 */
const application = {
  id: 'application-1',
  opportunityId: opportunity.id,
  opportunityTitle: opportunity.title,
  applicantId: 'researcher-2',
  applicantFullName: 'Trần Thị B',
  applicantEmail: 'tranthib@fpt.edu.vn',
  applicantDepartmentUnit: 'Quantum Optics Lab',
  applicantAvatarStorageKey: null,
  applicantNote:
    'I work on coupled resonators and would like to join the programme.',
  status: 'PENDING' as const,
  responseNote: null,
  respondedBy: null,
  appliedAt: '2026-11-10T08:00:00.000Z',
  responseDueAt: '2026-11-24T08:00:00.000Z',
  respondedAt: null,
  withdrawnAt: null,
  countdownAsOf: '2026-11-12T08:00:00.000Z',
  remainingSeconds: 1036800,
  isOverdue: false,
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

/**
 * The application list shows who applied — avatar, name, department and
 * email — and the name links to the applicant's profile.
 */
export const Applications: Story = {
  args: { opportunity },
  render: () => (
    <OpportunityApplications
      applications={[application]}
      isLoading={false}
      isFailed={false}
      onRetry={() => undefined}
    />
  ),
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Trần Thị B' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'Trần Thị B' }),
    ).toHaveAttribute('href', '/en/profile/researcher-2');
    // The department and the email share one metadata line, separated by
    // a middot.
    await expect(
      canvas.getByText('Quantum Optics Lab · tranthib@fpt.edu.vn'),
    ).toBeVisible();
  },
};

/**
 * An applicant without a profile row still appears — the name falls back
 * rather than the row disappearing.
 */
export const ApplicationWithoutProfile: Story = {
  args: { opportunity },
  render: () => (
    <OpportunityApplications
      applications={[
        {
          ...application,
          applicantFullName: '',
          applicantDepartmentUnit: '',
          applicantEmail: '',
        },
      ]}
      isLoading={false}
      isFailed={false}
      onRetry={() => undefined}
    />
  ),
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('link', { name: 'Unknown applicant' }),
    ).toHaveAttribute('href', '/en/profile/researcher-2');
  },
};
