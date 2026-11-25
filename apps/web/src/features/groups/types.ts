import type {
  ResearchGroupResponseDto,
  GroupMemberResponseDto,
  GroupDirectionResponseDto,
  GroupOutputLinkResponseDto,
  OpportunityResponseDto,
  GroupApplicationResponseDto,
} from '@/lib/api/models';

export type Group = ResearchGroupResponseDto;
export type Member = GroupMemberResponseDto;
export type Direction = GroupDirectionResponseDto;
export type OutputLink = GroupOutputLinkResponseDto;
export type Opportunity = OpportunityResponseDto;
export type Application = GroupApplicationResponseDto;

/** The tabs of the group workspace, in the order they appear. */
export type GroupTab =
  'outputs' | 'members' | 'directions' | 'opportunities' | 'applications';

export function groupPermissions(
  group: Group,
  user: { id: string; roles: string[] },
) {
  const researcher = user.roles.includes('RESEARCHER');
  const lead = group.leadId === user.id;
  const active = group.isActive && !group.archivedAt;
  const leader = group.callerMembershipRole === 'GROUP_LEADER';
  const manager = researcher && (lead || leader);
  return {
    editInfo: manager,
    manageMembers: manager,
    publishDirections: manager && active,
    editDirections: manager && active,
    manageOutputs: manager && active,
    manageOpportunities: manager && active,
  };
}
