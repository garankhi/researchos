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

export function groupPermissions(
  group: Group,
  user: { id: string; roles: string[] },
  members: Member[],
) {
  const researcher = user.roles.includes('RESEARCHER');
  const lead = group.leadId === user.id;
  const active = group.isActive && !group.archivedAt;
  const leader =
    group.callerMembershipRole === 'GROUP_LEADER' ||
    members.some(
      (member) => member.userId === user.id && member.role === 'GROUP_LEADER',
    );
  return {
    editInfo: user.roles.includes('ADMIN') || (researcher && lead),
    manageMembers: researcher && (lead || leader),
    publishDirections: researcher && active && (lead || leader),
    editDirections: researcher && active && lead,
    manageOutputs: researcher && active && lead,
    manageOpportunities: researcher && active && (lead || leader),
  };
}
