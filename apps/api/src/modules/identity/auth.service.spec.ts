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
  hash: vi.fn(),
}));

import { verify, hash } from '@node-rs/argon2';
import { ROLES } from '../../common/constants/roles.js';

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

/**
 * The `INSERT INTO user_sessions` call of a mocked transaction.
 *
 * The insert is the one statement that writes the session row, so the
 * tests that care about the shape of the row look it up by its SQL rather
 * than by its position — the login runs several statements.
 */
function sessionInsertCall(spy: ReturnType<typeof vi.fn>): unknown[] {
  const call = spy.mock.calls.find((candidate) =>
    String((candidate[0] as unknown[]).join('?')).includes('INSERT INTO'),
  );

  return call ?? [];
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
    vi.mocked(hash).mockReset();

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

  describe('changePassword', () => {
    const dto = {
      currentPassword: 'Temporary!Password',
      newPassword: 'Replacement!Password2026',
    };

    function validChangeSession() {
      withValidCredential();
      tx.$queryRaw.mockResolvedValueOnce([
        { id: 'session-1', auth_method: 'LOCAL' },
      ]);
      vi.mocked(verify).mockResolvedValue(true);
      vi.mocked(hash).mockResolvedValue('replacement-hash');
    }

    it('verifies the current password and updates the hash/flag atomically', async () => {
      validChangeSession();
      await service.changePassword('user-1', 'session-1', dto);
      expect(verify).toHaveBeenCalledWith('hash', dto.currentPassword);
      expect(hash).toHaveBeenCalledWith(dto.newPassword);
      expect(lastQueryText(tx.$executeRaw)).toContain(
        'must_change_password = false',
      );
      expect(lastQueryValues(tx.$executeRaw)).toContain('replacement-hash');
      expect(lastQueryValues(tx.$executeRaw)).not.toContain(dto.newPassword);
      const selects = tx.$queryRaw.mock.calls.map((call) =>
        (call[0] as string[]).join('?'),
      );
      expect(selects[0]).toContain('FROM users');
      expect(selects[1]).toContain('FROM local_credentials');
      expect(selects[2]).toContain('FROM user_sessions');
      expect(selects.every((sql) => sql.includes('FOR UPDATE'))).toBe(true);
      expect(selects[2]).toContain('clock_timestamp()');
    });

    it('does not change credentials when the current password is rejected', async () => {
      validChangeSession();
      vi.mocked(verify).mockResolvedValue(false);
      await expect(
        service.changePassword('user-1', 'session-1', dto),
      ).rejects.toMatchObject({ status: 401 });
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
    });

    it('rechecks session revocation/expiry inside the transaction', async () => {
      withValidCredential();
      tx.$queryRaw.mockResolvedValueOnce([]);
      await expect(
        service.changePassword('user-1', 'revoked-session', dto),
      ).rejects.toMatchObject({ status: 401 });
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });

    it('rejects OIDC sessions and leaves the LOCAL credential alone', async () => {
      withValidCredential();
      tx.$queryRaw.mockResolvedValueOnce([
        { id: 'session-1', auth_method: 'OIDC' },
      ]);
      await expect(
        service.changePassword('user-1', 'session-1', dto),
      ).rejects.toMatchObject({ status: 403 });
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects reuse of the current password', async () => {
      validChangeSession();
      await expect(
        service.changePassword('user-1', 'session-1', {
          ...dto,
          newPassword: dto.currentPassword,
        }),
      ).rejects.toMatchObject({ status: 400, code: 'password_unchanged' });
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects an OIDC-only account with 403 rather than invalidating its session', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: 'user-1', is_active: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'session-1', auth_method: 'OIDC' }]);
      await expect(
        service.changePassword('user-1', 'session-1', dto),
      ).rejects.toMatchObject({ status: 403 });
      expect(tx.$executeRaw).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    });
  });

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
      expect(result.me.roles).toEqual([ROLES.RESEARCHER]);
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

      const insert = sessionInsertCall(tx.$executeRaw);
      const values = (insert.slice(1) ?? []) as unknown[];

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

    /**
     * The timestamps of the session row are compared against each other by
     * the check `ck_session_times` (`authenticated_at <= created_at AND
     * last_seen_at >= created_at`), and `created_at` is written by the
     * **database** as the transaction start time.
     *
     * So a login that takes any measurable time — the Argon2id
     * verification happens inside the transaction — makes the app's clock
     * read later than `created_at`, and the row is rejected. The fix is to
     * let the database own all three timestamps, so they are always
     * consistent with each other.
     *
     * These tests pin that: no timestamp comes from the application.
     */
    describe('the timestamps of the session row', () => {
      it('takes every timestamp from the database, not from the application', async () => {
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

        const insert = sessionInsertCall(tx.$executeRaw);
        const sql = String((insert[0] as unknown[]).join('?'));
        const values = (insert.slice(1) ?? []) as unknown[];

        // The three columns the check compares all read the database clock.
        expect(sql.match(/CURRENT_TIMESTAMP/g)).toHaveLength(5);

        // No timestamp travels as a parameter — that would be the
        // application clock, which is exactly what the check rejects.
        expect(values.some((value) => value instanceof Date)).toBe(false);
      });

      it('derives the expiries from the same database timestamp', async () => {
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

        const insert = sessionInsertCall(tx.$executeRaw);
        const sql = String((insert[0] as unknown[]).join('?'));
        const values = (insert.slice(1) ?? []) as unknown[];

        // The expiries are the database timestamp plus a number of
        // seconds, so they cannot drift away from `created_at`.
        expect(sql).toContain("interval '1 second'");
        expect(values).toContain(43_200);
        expect(values).toContain(1_800);
      });
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

    it('stamps the revocation with the database clock', async () => {
      // `created_at` was written by the database, and the check
      // `ck_session_revocation` requires `revoked_at >= created_at`. The
      // two timestamps have to come from the same clock, so the revocation
      // is stamped in the database rather than from the application.
      await service.logout('raw-token');

      expect(lastQueryText(prisma.$executeRaw)).toContain('clock_timestamp()');
      expect(lastQueryValues(prisma.$executeRaw)).not.toContain(
        expect.any(Date),
      );
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
