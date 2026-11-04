import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@researchos/database';
import { AccessService } from './access.service.js';
import { resolveSessionTtls } from './session-ttl.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import type {
  EffectiveAccess,
  SessionResolver,
} from '../../common/auth/session-resolver.js';

/**
 * A session row as it is read from the `active_user_sessions` view.
 *
 * The view already applies `revoked_at IS NULL`, `expires_at > now()`,
 * `idle_expires_at > now()` and the join to an active `users` row — so a
 * row that comes back is a session that is usable right now.
 */
interface ActiveSessionRow {
  id: string;
  user_id: string;
  auth_method: 'LOCAL' | 'OIDC';
  expires_at: Date;
  idle_expires_at: Date;
  email: string;
  full_name: string;
  must_change_password: boolean | null;
}

/**
 * Owns every read and write against the session table.
 *
 * The guard never touches a session table: it hands over the raw cookie
 * value and receives a principal. Everything in between — hashing the
 * token, applying the expiry rules, sliding the idle window — happens
 * here.
 *
 * ## The hash is the only stored credential
 *
 * The raw token never reaches the database. It is hashed with SHA-256 and
 * the hex digest is stored in a `char(64)` column, which is exactly the
 * width of a SHA-256 hex string. The guard never learns the algorithm:
 * it hands over the raw value and gets back a principal or `null`.
 *
 * ## The idle window slides, the absolute expiry does not
 *
 * A refresh pushes `idle_expires_at` forward, but never past
 * `expires_at`. The database enforces the same rule with the check
 * `ck_session_expiry`, so a bug here cannot extend a session past its
 * absolute bound — it can only fail the write.
 */
@Injectable()
export class SessionService implements SessionResolver {
  private readonly absoluteTtlMs: number;
  private readonly idleTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly access: AccessService,
  ) {
    const { absoluteTtlMs, idleTtlMs } = resolveSessionTtls(config);

    this.absoluteTtlMs = absoluteTtlMs;
    this.idleTtlMs = idleTtlMs;
  }

  /**
   * Resolves a raw session token into the caller's principal.
   *
   * Returns `null` for a token that is unknown, expired, revoked, or
   * belongs to an inactive account. None of those is an error: they are
   * the states in which "not signed in" is the correct answer.
   */
  async resolve(token: string): Promise<AuthPrincipal | null> {
    const tokenHash = hashSessionToken(token);

    const rows = await this.prisma.$queryRaw<ActiveSessionRow[]>`
      SELECT
        s.id,
        s.user_id,
        s.auth_method,
        s.expires_at,
        s.idle_expires_at,
        u.email,
        u.full_name,
        c.must_change_password
      FROM active_user_sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN local_credentials c ON c.user_id = s.user_id
      WHERE s.session_token_hash = ${tokenHash}
    `;
    const session = rows[0];

    if (!session) {
      return null;
    }

    return {
      userId: session.user_id,
      sessionId: session.id,
      authMethod: session.auth_method,
      roles: await this.roleNamesFor(session.user_id),
      email: session.email,
      fullName: session.full_name,
    };
  }

  /**
   * Records that the session was seen and slides its idle window.
   *
   * The window never passes the absolute expiry: `idle_expires_at` is
   * capped at `expires_at`, which is what the database check
   * `ck_session_expiry` requires.
   *
   * A session that has already expired is not touched — the `WHERE` clause
   * excludes it, so a late refresh cannot resurrect a dead session.
   *
   * Every timestamp here comes from the **database** clock, not from the
   * application. The row's own `created_at` was written by the database,
   * and the check `ck_session_times` requires `last_seen_at >=
   * created_at` — a comparison between two timestamps that have to come
   * from the same clock. The expiry comparisons (`expires_at > now`,
   * `idle_expires_at > now`) have the same requirement, and `now()` is the
   * transaction time, which is the right reference for a statement that
   * reads and writes one row.
   */
  async refresh(sessionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE user_sessions
      SET
        last_seen_at = clock_timestamp(),
        idle_expires_at = LEAST(
          clock_timestamp() + ${this.idleTtlSeconds()} * interval '1 second',
          expires_at
        )
      WHERE id = ${sessionId}
        AND revoked_at IS NULL
        AND expires_at > now()
        AND idle_expires_at > now()
    `;
  }

  /**
   * The idle window, in whole seconds.
   *
   * The sliding expiry is anchored to the same clock as the row's
   * timestamps, so the number travels as a plain count of seconds and the
   * database does the arithmetic. A number is also the only thing a
   * parameterised query can carry — a SQL expression would be sent as a
   * string literal.
   */
  private idleTtlSeconds(): number {
    return Math.floor(this.idleTtlMs / 1000);
  }

  /**
   * Reads the effective roles of an account, live.
   *
   * The roles are never snapshotted in the session, so a revoked grant
   * takes effect on the next request rather than the next login.
   *
   * The read itself belongs to `AccessService`, which owns the
   * `effective_user_access` view. This method exists because the resolver
   * contract is what the guard asks, and the contract lives in the shared
   * leaf.
   */
  async effectiveRoles(userId: string): Promise<EffectiveAccess> {
    return this.access.effectiveRoles(userId);
  }

  /**
   * The role names the principal carries.
   *
   * The baseline rule lives in the database — a faculty account is a
   * researcher without an explicit grant — so the roles are read from the
   * same view the guard reads them from.
   */
  private async roleNamesFor(userId: string): Promise<string[]> {
    const access = await this.access.effectiveRoles(userId);
    const roles: string[] = [];

    if (access.isResearcher) {
      roles.push('RESEARCHER');
    }

    if (access.isAdmin) {
      roles.push('ADMIN');
    }

    return roles;
  }
}

/**
 * Hashes a raw session token into the value the database stores.
 *
 * SHA-256 over the raw token, hex encoded — 64 characters, which is the
 * width of the `session_token_hash` column.
 *
 * The token itself is random and high-entropy, so a fast hash is the
 * right one here: there is nothing to brute force, and the value must be
 * looked up by equality on every request.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * The lifetime a new session is issued with.
 */
export function sessionLifetimes(
  absoluteTtlMs: number,
  idleTtlMs: number,
): { expiresAt: Date; idleExpiresAt: Date } {
  const createdAt = new Date();

  return {
    expiresAt: new Date(createdAt.getTime() + absoluteTtlMs),
    idleExpiresAt: new Date(createdAt.getTime() + idleTtlMs),
  };
}
