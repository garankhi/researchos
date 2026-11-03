import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionGuard, PRINCIPAL_REQUEST_KEY } from './session.guard.js';
import { SESSION_RESOLVER } from '../auth/session-resolver.js';
import type { SessionResolver } from '../auth/session-resolver.js';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie.js';
import type { AuthPrincipal } from '../auth/auth-principal.js';

/**
 * The session guard is the front door: everything that is not explicitly
 * public goes through it. These tests pin the three things it must get
 * right — it lets a public route through, it refuses a request without a
 * valid session, and it attaches the principal the rest of the request
 * depends on.
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
 * A context whose request carries the given cookies.
 */
function contextWith(
  cookies: Record<string, string | undefined>,
): ExecutionContext {
  const request = { cookies };

  return {
    getHandler: () => handlerRef,
    getClass: () => classRef,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  let guard: SessionGuard;
  let reflector: Reflector;
  let resolve: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    resolve = vi.fn().mockResolvedValue(principal);
    refresh = vi.fn().mockResolvedValue(undefined);

    const resolver: SessionResolver = {
      resolve: vi.fn(async (token: string) => resolve(token)),
      refresh: vi.fn(async (sessionId: string) => refresh(sessionId)),
      effectiveRoles: vi
        .fn()
        .mockResolvedValue({ isResearcher: true, isAdmin: false }),
    };

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        SessionGuard,
        Reflector,
        { provide: SESSION_RESOLVER, useValue: resolver },
      ],
    }).compile();

    guard = app.get<SessionGuard>(SessionGuard);
    reflector = app.get<Reflector>(Reflector);
  });

  it('lets a public route through without a cookie', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(contextWith({}))).resolves.toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('refuses a request without a session cookie', async () => {
    await expect(guard.canActivate(contextWith({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('refuses a request whose cookie is empty', async () => {
    await expect(
      guard.canActivate(contextWith({ [SESSION_COOKIE_NAME]: '' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('hands the raw cookie value to the resolver', async () => {
    const raw = 'raw-token-value';

    await guard.canActivate(contextWith({ [SESSION_COOKIE_NAME]: raw }));

    expect(resolve).toHaveBeenCalledWith(raw);
  });

  it('refuses a request the resolver does not know', async () => {
    resolve.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextWith({ [SESSION_COOKIE_NAME]: 'token' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the principal to the request', async () => {
    const context = contextWith({ [SESSION_COOKIE_NAME]: 'token' });

    await guard.canActivate(context);

    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();

    expect(request[PRINCIPAL_REQUEST_KEY]).toEqual(principal);
  });

  it('slides the idle window after the session was validated', async () => {
    await guard.canActivate(contextWith({ [SESSION_COOKIE_NAME]: 'token' }));

    expect(refresh).toHaveBeenCalledWith(principal.sessionId);
  });

  it('still allows the request when the refresh fails', async () => {
    // The session was already validated. A failed bookkeeping write must
    // not turn a signed-in request into a 401.
    refresh.mockRejectedValue(new Error('write failed'));

    await expect(
      guard.canActivate(contextWith({ [SESSION_COOKIE_NAME]: 'token' })),
    ).resolves.toBe(true);
  });
});
