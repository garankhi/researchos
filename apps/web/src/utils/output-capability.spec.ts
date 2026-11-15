import { describe, expect, it } from 'vitest';
import { resolveOutputCapability } from './output-capability';

/**
 * The rule the UI mirrors from the backend's
 * `can_change_output_visibility`.
 */
describe('resolveOutputCapability', () => {
  const OWNER = '40bbc573-76a5-409e-9d4f-0b9362087073';
  const CO_AUTHOR = '7110ae22-09bb-41fb-9e5b-82f5abf61be4';
  const GROUP_LEAD = '87b4f585-ed4e-40de-888e-e165ecf7515e';
  const READER = 'e2897196-0433-4f11-9914-6d6c57586add';

  it('gives the owner full control', () => {
    const capability = resolveOutputCapability({
      userId: OWNER,
      ownerId: OWNER,
      authorUserIds: [OWNER],
    });

    expect(capability.role).toBe('owner');
    expect(capability.isOwner).toBe(true);
    expect(capability.canChangeVisibility).toBe(true);
  });

  it('does not let a co-author change the visibility', () => {
    const capability = resolveOutputCapability({
      userId: CO_AUTHOR,
      ownerId: OWNER,
      authorUserIds: [OWNER, CO_AUTHOR],
    });

    expect(capability.role).toBe('author');
    expect(capability.isOwner).toBe(false);
    expect(capability.isAuthor).toBe(true);
    expect(capability.canChangeVisibility).toBe(false);
  });

  it('lets the affiliated group lead change the visibility', () => {
    const capability = resolveOutputCapability({
      userId: GROUP_LEAD,
      ownerId: OWNER,
      authorUserIds: [OWNER],
      groupLeadId: GROUP_LEAD,
    });

    expect(capability.role).toBe('groupLead');
    expect(capability.canChangeVisibility).toBe(true);
  });

  it('does not let a group lead of an unaffiliated work change it', () => {
    const capability = resolveOutputCapability({
      userId: GROUP_LEAD,
      ownerId: OWNER,
      authorUserIds: [OWNER, GROUP_LEAD],
      groupLeadId: null,
    });

    expect(capability.role).toBe('author');
    expect(capability.canChangeVisibility).toBe(false);
  });

  it('does not let a reader change the visibility', () => {
    const capability = resolveOutputCapability({
      userId: READER,
      ownerId: OWNER,
      authorUserIds: [OWNER],
    });

    expect(capability.role).toBe('reader');
    expect(capability.canChangeVisibility).toBe(false);
  });

  it('gives a signed-out viewer nothing', () => {
    const capability = resolveOutputCapability({
      userId: null,
      ownerId: OWNER,
      authorUserIds: [OWNER],
      groupLeadId: GROUP_LEAD,
    });

    expect(capability.role).toBe('reader');
    expect(capability.userId).toBeNull();
    expect(capability.canChangeVisibility).toBe(false);
  });

  it('treats the owner as the owner even when they lead the group', () => {
    const capability = resolveOutputCapability({
      userId: OWNER,
      ownerId: OWNER,
      authorUserIds: [OWNER],
      groupLeadId: OWNER,
    });

    expect(capability.role).toBe('owner');
    expect(capability.isGroupLead).toBe(false);
  });
});
