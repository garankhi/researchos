import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, normalizeEmail } from './auth.service.js';
import { AccessService } from './access.service.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { domainErrorCodes } from '@researchos/error-codes';
import { PrismaService } from '@researchos/database';

/**
 * The login path is the only place a credential is verified, so these
 * tests pin three things: the failure never tells the caller *which* part
 * was wrong, the session is only written after the credential was
 * accepted, and the session row never stores the raw token.
 */

vi.mock('@node-rs/argon2', () => ({
  verify: vi.fn(),
}));

import { verify } from '@node-rs/argon2';

/**
 * A stub of the transaction client the login runs in.
 */
interface TxStub {
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
}

/**
 * The SQL text of the last raw query of the given spy.
 */
function lastQueryText(spy: ReturnType<typeof vi.fn>): string {
  const call = spy.mock.calls.at(-1);
  const strings = (call?.[0] ?? []) as unknown[];

  return strings.join('?');
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

describe('normalizeEmail', () => {
  it('trims and lowercases the address', () => {
    expect(normalizeEmail('  Faculty@ResearchOS.Local ')).toBe(
      'faculty@researchos.local',
    );
  });
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
    $executeRaw: ReturnType<typeof vi.fn>;
  };
  let tx: TxStub;
  let access: { effectiveRoles: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.mocked(verify).mockReset();

    tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(0),
    };

    prisma = {
      $transaction: vi.fn(async (fn: (t: TxStub) => unknown) => fn(tx)),
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
        AuthService,
        ConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
      ],
    }).compile();

    service = app.get<AuthService>(AuthService);
  });

  /**
   * A transaction that finds an active user with a credential.
   */
  function withValidCredential(): void {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'user-1', is_active: true }])
      .mockResolvedValueOnce([
        { password_hash: 'hash', must_change_password: false },
      ]);
  }

  describe('login', () => {
    it('rejects an unknown account with the generic invalid-credentials code', async () => {
      tx.$queryRaw.mockResolvedValue([]);

      const error = await service
        .login({ email: 'nobody@researchos.local', password: 'whatever' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CodedHttpException);
      expect((error as CodedHttpException).code).toBe(
        domainErrorCodes.identity.invalidCredentials,
      );
      expect((error as CodedHttpException).getStatus()).toBe(
        HttpStatus.UNAUTHORIZED,
      );
    });

    it('rejects an inactive account with the account-inactive code', async () => {
      tx.$queryRaw.mockResolvedValueOnce([{ id: 'user-1', is_active: false }]);

      const error = await service
        .login({ email: 'faculty@researchos.local', password: 'whatever' })
        .catch((e: unknown) => e);

      expect((error as CodedHttpException).code).toBe(
        domainErrorCodes.identity.accountInactive,
      );
    });

    it('rejects an account without a local credential', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1', is_active: true }])
        .mockResolvedValueOnce([]);

      const error = await service
        .login({ email: 'faculty@researchos.local', password: 'whatever' })
        .catch((e: unknown) => e);

      expect((error as CodedHttpException).code).toBe(
        domainErrorCodes.identity.invalidCredentials,
      );
    });

    it('rejects a wrong password with the same code as an unknown account', async () => {
      // The two failures must be indistinguishable, or the endpoint
      // becomes a user-enumeration oracle.
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1', is_active: true }])
        .mockResolvedValueOnce([
          { password_hash: 'hash', must_change_password: false },
        ]);
      vi.mocked(verify).mockResolvedValue(false);

      const error = await service
        .login({ email: 'faculty@researchos.local', password: 'wrong' })
        .catch((e: unknown) => e);

      expect((error as CodedHttpException).code).toBe(
        domainErrorCodes.identity.invalidCredentials,
      );
    });

    it('never writes a session for a rejected credential', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1', is_active: true }])
        .mockResolvedValueOnce([
          { password_hash: 'hash', must_change_password: false },
        ]);
      vi.mocked(verify).mockResolvedValue(false);

      await service
        .login({ email: 'faculty@researchos.local', password: 'wrong' })
        .catch(() => undefined);

      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('issues a session for an accepted credential', async () => {
      withValidCredential();
      vi.mocked(verify).mockResolvedValue(true);

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'user-1',
          email: 'faculty@researchos.local',
          full_name: 'Dev Faculty',
          user_type: 'FACULTY',
          department_unit: 'FPTU',
          academic_title: null,
          academic_degree: null,
        },
      ]);

      const result = await service.login({
        email: 'faculty@researchos.local',
        password: 'correct',
      });

      expect(result.token).toEqual(expect.any(String));
      expect(result.me.id).toBe('user-1');
      expect(result.me.roles).toEqual(['RESEARCHER']);
    });

    it('stores only the hash of the token', async () => {
      withValidCredential();
      vi.mocked(verify).mockResolvedValue(true);

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'user-1',
          email: 'faculty@researchos.local',
          full_name: 'Dev Faculty',
          user_type: 'FACULTY',
          department_unit: 'FPTU',
          academic_title: null,
          academic_degree: null,
        },
      ]);

      const result = await service.login({
        email: 'faculty@researchos.local',
        password: 'correct',
      });

      const insert = tx.$executeRaw.mock.calls.find((call) =>
        String((call[0] as unknown[]).join('?')).includes('INSERT INTO'),
      );
      const values = (insert?.slice(1) ?? []) as unknown[];

      expect(values).not.toContain(result.token);
      expect(
        values.some(
          (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value),
        ),
      ).toBe(true);
    });

    it('locks the user row before it reads the credential', async () => {
      withValidCredential();
      vi.mocked(verify).mockResolvedValue(true);

      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'user-1',
          email: 'faculty@researchos.local',
          full_name: 'Dev Faculty',
          user_type: 'FACULTY',
          department_unit: 'FPTU',
          academic_title: null,
          academic_degree: null,
        },
      ]);

      await service.login({
        email: 'faculty@researchos.local',
        password: 'correct',
      });

      expect(lastQueryText(tx.$queryRaw)).toContain('FOR UPDATE');
    });
  });

  describe('logout', () => {
    it('revokes the session behind the token', async () => {
      await service.logout('raw-token');

      expect(lastQueryText(prisma.$executeRaw)).toContain('revoked_at');
      expect(lastQueryText(prisma.$executeRaw)).toContain('LOGOUT');
      expect(lastQueryValues(prisma.$executeRaw)).not.toContain('raw-token');
    });

    it('does not fail when there is no session to revoke', async () => {
      await expect(service.logout('unknown')).resolves.toBeUndefined();
    });
  });

  describe('me', () => {
    it('refuses an unknown account', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.me('user-1')).rejects.toThrow();
    });

    it('reports the profile flags of the account', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'faculty@researchos.local',
          full_name: 'Dev Faculty',
          user_type: 'FACULTY',
          department_unit: 'FPTU',
          academic_title: 'PGS',
          academic_degree: null,
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        { onboarding_completed_at: new Date(), profile_confirmed_at: null },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ must_change_password: true }]);

      const me = await service.me('user-1');

      expect(me.onboardingCompleted).toBe(true);
      expect(me.profileConfirmed).toBe(false);
      expect(me.mustChangePassword).toBe(true);
      expect(me.academicTitle).toBe('PGS');
      expect(me.academicDegree).toBeNull();
    });

    it('treats a missing profile as not onboarded', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'faculty@researchos.local',
          full_name: 'Dev Faculty',
          user_type: 'FACULTY',
          department_unit: 'FPTU',
          academic_title: null,
          academic_degree: null,
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([]);
      prisma.$queryRaw.mockResolvedValueOnce([]);

      const me = await service.me('user-1');

      expect(me.onboardingCompleted).toBe(false);
      expect(me.profileConfirmed).toBe(false);
      expect(me.mustChangePassword).toBe(false);
    });
  });
});
