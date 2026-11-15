import { describe, expect, it } from 'vitest';
import { groupPermissions, type Group, type Member } from './types';

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
const member = { userId: 'leader', role: 'GROUP_LEADER' } as Member;

describe('group hub management visibility', () => {
  it('uses the caller role from group detail even before later roster pages are loaded', () => {
    expect(
      groupPermissions(
        { ...group, callerMembershipRole: 'GROUP_LEADER' },
        { id: 'leader', roles: ['RESEARCHER'] },
        [],
      ).manageMembers,
    ).toBe(true);
  });
  it('keeps outsiders and ordinary members readonly', () => {
    for (const id of ['outsider', 'member']) {
      expect(
        Object.values(
          groupPermissions(group, { id, roles: ['RESEARCHER'] }, [member]),
        ).every((value) => !value),
      ).toBe(true);
    }
  });

  it('allows the designated lead to manage every section', () => {
    expect(
      Object.values(
        groupPermissions(group, { id: 'lead', roles: ['RESEARCHER'] }, []),
      ).every(Boolean),
    ).toBe(true);
  });

  it('allows GROUP_LEADER members only the operations their endpoints permit', () => {
    expect(
      groupPermissions(group, { id: 'leader', roles: ['RESEARCHER'] }, [
        member,
      ]),
    ).toEqual({
      editInfo: false,
      manageMembers: true,
      publishDirections: true,
      editDirections: false,
      manageOutputs: false,
      manageOpportunities: true,
    });
  });

  it('allows admins to edit group info without granting content management', () => {
    expect(
      groupPermissions(group, { id: 'admin', roles: ['ADMIN'] }, []),
    ).toEqual({
      editInfo: true,
      manageMembers: false,
      publishDirections: false,
      editDirections: false,
      manageOutputs: false,
      manageOpportunities: false,
    });
  });

  it('hides researcher-only operations after role revocation', () => {
    expect(
      Object.values(
        groupPermissions(group, { id: 'lead', roles: [] }, []),
      ).every((value) => !value),
    ).toBe(true);
  });

  it('keeps restoration available but hides active-only workflows after archive', () => {
    expect(
      groupPermissions(
        { ...group, isActive: false, archivedAt: '2026-11-15T01:00:00Z' },
        { id: 'lead', roles: ['RESEARCHER'] },
        [],
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
