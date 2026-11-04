import type { ConfigService } from '@nestjs/config';

/**
 * The lifetimes of a session.
 *
 * They live in their own file because three places need them and they
 * must not drift: the service that issues a session, the service that
 * refreshes one, and the controller that writes the cookie.
 *
 * A session has two bounds:
 *
 * - the **absolute** expiry, which never moves;
 * - the **idle** expiry, which slides forward on every use but never past
 *   the absolute expiry.
 *
 * The database enforces the same rule with the check `ck_session_expiry`
 * (`idle_expires_at <= expires_at`), so a bug here cannot extend a
 * session past its absolute bound — it can only fail the write.
 */

/**
 * The absolute lifetime of a session, in hours.
 */
export const DEFAULT_ABSOLUTE_TTL_HOURS = 12;

/**
 * The idle window of a session, in minutes.
 *
 * A session that is not seen for this long stops being usable, even
 * though its absolute expiry has not passed.
 */
export const DEFAULT_IDLE_TTL_MINUTES = 30;

/**
 * The two session bounds, in milliseconds.
 */
export interface SessionTtls {
  /** The absolute lifetime. The session is gone when it passes. */
  absoluteTtlMs: number;
  /** The idle window. It slides, but never past the absolute bound. */
  idleTtlMs: number;
}

/**
 * Reads the session lifetimes from the configuration.
 *
 * The environment variables are the override; the constants are the
 * default. Both sides of the session — the issue and the refresh — read
 * them through this function, so the two can never disagree about how
 * long a session lives.
 */
export function resolveSessionTtls(config: ConfigService): SessionTtls {
  const absoluteTtlHours =
    config.get<number>('SESSION_ABSOLUTE_TTL_HOURS') ??
    DEFAULT_ABSOLUTE_TTL_HOURS;

  const idleTtlMinutes =
    config.get<number>('SESSION_IDLE_TTL_MINUTES') ?? DEFAULT_IDLE_TTL_MINUTES;

  return {
    absoluteTtlMs: absoluteTtlHours * 60 * 60 * 1000,
    idleTtlMs: idleTtlMinutes * 60 * 1000,
  };
}
