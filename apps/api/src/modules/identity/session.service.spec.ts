import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService, hashSessionToken } from './session.service.js';
import { AccessService } from './access.service.js';
import { PrismaService } from '@researchos/database';

/**
 * The session service owns the rules the guard must not know: the hash,
 * the expiry bounds and the live role read.
 *
 * The Prisma client is stubbed rather than mocked wholesale — the raw
 * queries are the contract with the database, so the tests check *what*
 * was queried as well as what came back.
 */

/**
 * A stub of the parts of `PrismaService` the session service uses.
 */
interface PrismaStub {
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
}

/**
 * The values interpolated into the last raw query.
 *
 * The first argument of a tagged-template call is the strings array; the
 * values follow it.
 */
function lastQueryValues(spy: ReturnType<typeof vi.fn>): unknown[] {
  const call = spy.mock.calls.at(-1);

  return (call?.slice(1) ?? []) as unknown[];
}

/**
 * The SQL text of the last raw query.
 */
function lastQueryText(spy: ReturnType<typeof vi.fn>): string {
  const call = spy.mock.calls.at(-1);
  const strings = (call?.[0] ?? []) as unknown[];

  return strings.join('?');
}

describe('hashSessionToken', () => {
  it('produces a 64 character hex digest', () => {
    // The column is `char(64)`, which is exactly the width of a SHA-256
    // hex string. A longer or shorter digest would not fit.
    expect(hashSessionToken('token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for the same token', () => {
    expect(hashSessionToken('token')).toBe(hashSessionToken('token'));
  });

  it('differs for different tokens', () => {
    expect(hashSessionToken('a')).not.toBe(hashSessionToken('b'));
  });
});

describe('SessionService', () => {
  let service: SessionService;
  let prisma: PrismaStub;
  let access: { effectiveRoles: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(0),
    };

    access = {
      effectiveRoles: vi
        .fn()
        .mockResolvedValue({ isResearcher: true, isAdmin: false }),
    };

    const app: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        ConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
      ],
    }).compile();

    service = app.get<SessionService>(SessionService);
  });

  describe('resolve', () => {
    it('returns null for an unknown token', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.resolve('token')).resolves.toBeNull();
    });

    it('looks the token up by its hash, never by the raw value', async () => {
      await service.resolve('raw-token');

      expect(lastQueryText(prisma.$queryRaw)).toContain('active_user_sessions');
      expect(lastQueryValues(prisma.$queryRaw)).toContain(
        hashSessionToken('raw-token'),
      );
      expect(lastQueryValues(prisma.$queryRaw)).not.toContain('raw-token');
    });

    it('builds a principal from the session row', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'session-1',
          user_id: 'user-1',
          auth_method: 'LOCAL',
          expires_at: new Date(),
          idle_expires_at: new Date(),
          email: 'faculty@researchos.local',
          full_name: 'Dev Faculty',
          must_change_password: false,
        },
      ]);

      await expect(service.resolve('token')).resolves.toEqual({
        userId: 'user-1',
        sessionId: 'session-1',
        authMethod: 'LOCAL',
        roles: ['RESEARCHER'],
        email: 'faculty@researchos.local',
        fullName: 'Dev Faculty',
      });
    });

    it('reads the roles live', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'session-1',
          user_id: 'user-1',
          auth_method: 'LOCAL',
          expires_at: new Date(),
          idle_expires_at: new Date(),
          email: 'faculty@researchos.local',
          full_name: 'Dev Faculty',
          must_change_password: false,
        },
      ]);
      access.effectiveRoles.mockResolvedValue({
        isResearcher: true,
        isAdmin: true,
      });

      const principal = await service.resolve('token');

      expect(principal?.roles).toEqual(['RESEARCHER', 'ADMIN']);
    });

    it('reports an administrator as both roles', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'session-1',
          user_id: 'user-1',
          auth_method: 'OIDC',
          expires_at: new Date(),
          idle_expires_at: new Date(),
          email: 'admin@researchos.local',
          full_name: 'Admin',
          must_change_password: null,
        },
      ]);
      access.effectiveRoles.mockResolvedValue({
        isResearcher: true,
        isAdmin: true,
      });

      const principal = await service.resolve('token');

      expect(principal?.authMethod).toBe('OIDC');
      expect(principal?.roles).toEqual(['RESEARCHER', 'ADMIN']);
    });
  });

  describe('refresh', () => {
    it('caps the idle window at the absolute expiry', async () => {
      await service.refresh('session-1');

      expect(lastQueryText(prisma.$executeRaw)).toContain('LEAST(');
      expect(lastQueryText(prisma.$executeRaw)).toContain('expires_at');
    });

    it('never touches a session that is already gone', async () => {
      await service.refresh('session-1');

      const sql = lastQueryText(prisma.$executeRaw);

      expect(sql).toContain('revoked_at IS NULL');
      expect(sql).toContain('expires_at >');
      expect(sql).toContain('idle_expires_at >');
    });

    it('takes every timestamp from the database, not from the application', async () => {
      // The row's `created_at` was written by the database, and the check
      // `ck_session_times` requires `last_seen_at >= created_at`. The two
      // timestamps have to come from the same clock, so the refresh reads
      // the database clock rather than the application clock.
      await service.refresh('session-1');

      const sql = lastQueryText(prisma.$executeRaw);

      expect(sql).toContain('clock_timestamp()');
      expect(lastQueryValues(prisma.$executeRaw)).not.toContain(
        expect.any(Date),
      );
    });

    it('derives the sliding window from the database clock', async () => {
      await service.refresh('session-1');

      expect(lastQueryText(prisma.$executeRaw)).toContain(
        "interval '1 second'",
      );
      expect(lastQueryValues(prisma.$executeRaw)).toContain(1_800);
    });
  });

  describe('effectiveRoles', () => {
    it('delegates to the access service', async () => {
      await expect(service.effectiveRoles('user-1')).resolves.toEqual({
        isResearcher: true,
        isAdmin: false,
      });
      expect(access.effectiveRoles).toHaveBeenCalledWith('user-1');
    });
  });
});
