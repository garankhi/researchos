import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleGuard } from './role.guard.js';
import { SESSION_RESOLVER } from '../auth/session-resolver.js';
import type { SessionResolver } from '../auth/session-resolver.js';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator.js';
import { PRINCIPAL_REQUEST_KEY } from './session.guard.js';
import type { AuthPrincipal } from '../auth/auth-principal.js';

/**
 * The role guard answers one question: does the caller hold every role
 * the route asks for? The roles are read live, so a revoked grant takes
 * effect on the next request — that is the behaviour these tests pin.
 */

const principal: AuthPrincipal = {
  userId: 'user-1',
  sessionId: 'session-1',
  authMethod: 'LOCAL',
  roles: ['RESEARCHER'],
  email: 'faculty@researchos.local',
  fullName: 'Dev Faculty',
};

const handlerRef = (): void => undefined;
const classRef = (): void => undefined;

/**
 * A context whose request carries the given principal.
 */
function contextWith(attached: AuthPrincipal | undefined): ExecutionContext {
  const request: Record<string, unknown> = {};

  if (attached) {
    request[PRINCIPAL_REQUEST_KEY] = attached;
  }

  return {
    getHandler: () => handlerRef,
    getClass: () => classRef,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RoleGuard', () => {
  let guard: RoleGuard;
  let reflector: Reflector;
  let effectiveRoles: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    effectiveRoles = vi
      .fn()
      .mockResolvedValue({ isResearcher: true, isAdmin: false });

    const resolver: SessionResolver = {
      resolve: vi.fn().mockResolvedValue(principal),
      refresh: vi.fn().mockResolvedValue(undefined),
      effectiveRoles: vi.fn(async (userId: string) => effectiveRoles(userId)),
    };

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        RoleGuard,
        Reflector,
        { provide: SESSION_RESOLVER, useValue: resolver },
      ],
    }).compile();

    guard = app.get<RoleGuard>(RoleGuard);
    reflector = app.get<Reflector>(Reflector);
  });

  it('allows a route that asks for no role', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    await expect(guard.canActivate(contextWith(principal))).resolves.toBe(true);
    expect(effectiveRoles).not.toHaveBeenCalled();
  });

  it('allows a route that asks for an empty role list', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    await expect(guard.canActivate(contextWith(principal))).resolves.toBe(true);
  });

  it('refuses a request without a principal', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

    await expect(
      guard.canActivate(contextWith(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows a caller that holds the required role', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['RESEARCHER']);

    await expect(guard.canActivate(contextWith(principal))).resolves.toBe(true);
    expect(effectiveRoles).toHaveBeenCalledWith(principal.userId);
  });

  it('refuses a caller that does not hold the required role', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

    await expect(
      guard.canActivate(contextWith(principal)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires every listed role, not just one', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      'RESEARCHER',
      'ADMIN',
    ]);

    await expect(
      guard.canActivate(contextWith(principal)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads the roles live, not from the principal snapshot', async () => {
    // The principal carries the roles it had when the request was
    // resolved. The guard asks the resolver again, so a grant revoked
    // between the two takes effect immediately.
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    effectiveRoles.mockResolvedValue({ isResearcher: true, isAdmin: true });

    await expect(guard.canActivate(contextWith(principal))).resolves.toBe(true);
  });

  it('refuses a role that was revoked after the session was issued', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    effectiveRoles.mockResolvedValue({ isResearcher: true, isAdmin: false });

    await expect(
      guard.canActivate(contextWith(principal)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

/**
 * The metadata key is part of the contract between the decorator and the
 * guard, so a rename on one side without the other is caught here.
 */
describe('the roles metadata key', () => {
  it('is the key the guard reads', () => {
    expect(ROLES_METADATA_KEY).toBe('researchos:roles');
  });
});
