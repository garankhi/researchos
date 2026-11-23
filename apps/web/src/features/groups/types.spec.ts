import { describe, expect, it } from 'vitest';
import { groupPermissions, type Group } from './types';

const group: Group = {
  id: 'group',
  name: 'Research group',
  code: 'RG',
  leadId: 'lead',
  description: null,
  isActive: true,
  archivedAt: null,
  createdAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
};

describe('group hub management visibility', () => {
  it('uses the caller role from group detail even before later roster pages are loaded', () => {
    expect(
      groupPermissions(
        { ...group, callerMembershipRole: 'GROUP_LEADER' },
        { id: 'leader', roles: ['RESEARCHER'] },
      ).manageMembers,
    ).toBe(true);
  });
  it('keeps ordinary members and callers without an active membership read-only', () => {
    for (const callerMembershipRole of ['MEMBER', undefined] as const) {
      expect(
        Object.values(
          groupPermissions(
            { ...group, callerMembershipRole },
            {
              id: 'member',
              roles: ['RESEARCHER'],
            },
          ),
        ).every((value) => !value),
      ).toBe(true);
    }
  });

  it('allows the designated lead to manage every section', () => {
    expect(
      Object.values(
        groupPermissions(group, { id: 'lead', roles: ['RESEARCHER'] }),
      ).every(Boolean),
    ).toBe(true);
  });

  it('gives every GROUP_LEADER full management access', () => {
    expect(
      groupPermissions(
        { ...group, callerMembershipRole: 'GROUP_LEADER' },
        { id: 'leader', roles: ['RESEARCHER'] },
      ),
    ).toEqual({
      editInfo: true,
      manageMembers: true,
      publishDirections: true,
      editDirections: true,
      manageOutputs: true,
      manageOpportunities: true,
    });
  });

  it('keeps unrelated admins readonly', () => {
    expect(groupPermissions(group, { id: 'admin', roles: ['ADMIN'] })).toEqual({
      editInfo: false,
      manageMembers: false,
      publishDirections: false,
      editDirections: false,
      manageOutputs: false,
      manageOpportunities: false,
    });
  });

  it('hides researcher-only operations after role revocation', () => {
    expect(
      Object.values(groupPermissions(group, { id: 'lead', roles: [] })).every(
        (value) => !value,
      ),
    ).toBe(true);
  });

  it('keeps restoration available but hides active-only workflows after archive', () => {
    expect(
      groupPermissions(
        { ...group, isActive: false, archivedAt: '2026-11-15T01:00:00Z' },
        { id: 'lead', roles: ['RESEARCHER'] },
      ),
    ).toEqual({
      editInfo: true,
      manageMembers: true,
      publishDirections: false,
      editDirections: false,
      manageOutputs: false,
      manageOpportunities: false,
    });
  });
});
