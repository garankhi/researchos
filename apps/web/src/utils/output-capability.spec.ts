import { describe, expect, it } from 'vitest';
import {
  allowedOutputAudiences,
  resolveOutputCapability,
} from './output-capability';

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
      scopeType: 'PERSONAL',
      canChangeVisibility: true,
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
      scopeType: 'PERSONAL',
      canChangeVisibility: false,
    });

    expect(capability.role).toBe('author');
    expect(capability.isOwner).toBe(false);
    expect(capability.isAuthor).toBe(true);
    expect(capability.canChangeVisibility).toBe(false);
  });

  it('lets the group lead change the visibility of a group work', () => {
    // The server settles this: the group owns the work, so the leads
    // decide who may read it, not the poster.
    const capability = resolveOutputCapability({
      userId: GROUP_LEAD,
      ownerId: OWNER,
      authorUserIds: [OWNER],
      scopeType: 'GROUP',
      canChangeVisibility: true,
    });

    expect(capability.role).toBe('reader');
    expect(capability.canChangeVisibility).toBe(true);
    expect(capability.allowedAudiences).toEqual([
      'CONTAINER',
      'FPTU_COMMUNITY',
    ]);
  });

  it('does not let the poster of a group work change its visibility', () => {
    const capability = resolveOutputCapability({
      userId: OWNER,
      ownerId: OWNER,
      authorUserIds: [OWNER],
      scopeType: 'GROUP',
      canChangeVisibility: false,
    });

    expect(capability.role).toBe('owner');
    expect(capability.canChangeVisibility).toBe(false);
  });

  it('does not let a reader change the visibility', () => {
    const capability = resolveOutputCapability({
      userId: READER,
      ownerId: OWNER,
      authorUserIds: [OWNER],
      scopeType: 'PERSONAL',
      canChangeVisibility: false,
    });

    expect(capability.role).toBe('reader');
    expect(capability.canChangeVisibility).toBe(false);
  });

  it('gives a signed-out viewer nothing', () => {
    const capability = resolveOutputCapability({
      userId: null,
      ownerId: OWNER,
      authorUserIds: [OWNER],
      scopeType: 'PERSONAL',
      canChangeVisibility: true,
    });

    expect(capability.role).toBe('reader');
    expect(capability.userId).toBeNull();
    expect(capability.canChangeVisibility).toBe(false);
  });

  it('offers the personal audiences for a personal work', () => {
    const capability = resolveOutputCapability({
      userId: OWNER,
      ownerId: OWNER,
      scopeType: 'PERSONAL',
      canChangeVisibility: true,
    });

    expect(capability.allowedAudiences).toEqual(['PRIVATE', 'FPTU_COMMUNITY']);
  });

  it('offers the container audiences for a project work', () => {
    const capability = resolveOutputCapability({
      userId: OWNER,
      ownerId: OWNER,
      scopeType: 'PROJECT',
      canChangeVisibility: true,
    });

    expect(capability.allowedAudiences).toEqual([
      'CONTAINER',
      'FPTU_COMMUNITY',
    ]);
  });
});

describe('allowedOutputAudiences', () => {
  it('gives a personal work a private and a community audience', () => {
    expect(allowedOutputAudiences('PERSONAL')).toEqual([
      'PRIVATE',
      'FPTU_COMMUNITY',
    ]);
  });

  it('gives a group work a container and a community audience', () => {
    expect(allowedOutputAudiences('GROUP')).toEqual([
      'CONTAINER',
      'FPTU_COMMUNITY',
    ]);
  });

  it('gives a project work a container and a community audience', () => {
    expect(allowedOutputAudiences('PROJECT')).toEqual([
      'CONTAINER',
      'FPTU_COMMUNITY',
    ]);
  });
});
