import type {
  OpportunityResponseDto,
  ApplicationResponseDto,
  GroupApplicationResponseDto,
} from '@/lib/api/models';

export type Opportunity = OpportunityResponseDto;
export type Application = ApplicationResponseDto;
export type GroupApplication = GroupApplicationResponseDto;

/**
 * The lifecycle status of an opportunity.
 *
 * The API owns this list; the screen only maps a status to a badge colour
 * and to the actions it allows.
 */
export type OpportunityStatus = Opportunity['status'];

/**
 * The tab strip of the opportunity screen.
 *
 * An opportunity has one content tab — its detail — and, for a manager, a
 * second one listing the applications it received.
 */
export type OpportunityTab = 'overview' | 'applications';

/**
 * The actions the current caller may take on an opportunity.
 *
 * The API decides this; the screen only renders what it is told.
 */
export function opportunityPermissions(
  opportunity: Opportunity,
  user: { id: string; roles: string[] } | null,
) {
  const researcher = Boolean(user?.roles?.includes('RESEARCHER'));
  const isCreator = Boolean(user && opportunity.creatorId === user.id);
  const canManage = Boolean(opportunity.canManage);

  return {
    /** Whether the caller may edit, open, close or archive the opportunity. */
    canManage,
    /** Whether the caller may apply to the opportunity. */
    canApply:
      researcher &&
      !canManage &&
      opportunity.status === 'OPEN' &&
      !opportunity.archivedAt,
    /** Whether the caller may see the applications the opportunity received. */
    canSeeApplications: canManage,
    /** Whether the caller created the opportunity. */
    isCreator,
  };
}
