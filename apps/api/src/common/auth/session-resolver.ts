import type { AuthPrincipal } from './auth-principal.js';

/**
 * The contract the identity module implements and the guards consume.
 *
 * This is the seam that keeps `common/` free of the identity module. The
 * guard hands over the **raw** cookie value; the resolver owns the
 * hashing, the lookup and the expiry rules. The guard never learns how a
 * session token is turned into a row, and the identity module never has to
 * know that a guard exists.
 *
 * The dependency graph is a tree with no cycle:
 *
 * ```text
 * common/auth/          <- the shared leaf: principal type + resolver contract
 * common/guards/        <- SessionGuard, RoleGuard (depend on the leaf only)
 * modules/identity/     <- SessionService, AccessService, users + auth endpoints
 * ```
 */

/**
 * The injection token the resolver is provided under.
 *
 * The identity module registers it with `useExisting`, so the same
 * instance answers every consumer:
 *
 * ```typescript
 * { provide: SESSION_RESOLVER, useExisting: SessionService }
 * ```
 */
export const SESSION_RESOLVER = Symbol('SESSION_RESOLVER');

/**
 * The effective access a user has, resolved from the live role grants.
 *
 * `isResearcher` carries the `FACULTY` baseline — a faculty account is a
 * researcher without any explicit grant — so a caller never has to know
 * that rule.
 */
export interface EffectiveAccess {
  /** Whether the account may act as a researcher. */
  isResearcher: boolean;
  /** Whether the account may act as an administrator. */
  isAdmin: boolean;
}

/**
 * What a guard is allowed to ask the identity module.
 *
 * Every method here is a *read* of the session or the roles. The write
 * side — verifying a credential and issuing a session — belongs to the
 * login path, which is not a guard's business.
 */
export interface SessionResolver {
  /**
   * Resolves a raw session token into the caller's principal.
   *
   * Returns `null` when the token is unknown, expired, revoked, or belongs
   * to an inactive account. A missing or malformed token is an expected
   * state, not an error, so this never throws for "not signed in".
   */
  resolve(token: string): Promise<AuthPrincipal | null>;

  /**
   * Records that the session was seen, and pushes its idle expiry
   * forward.
   *
   * The absolute expiry is never extended past its own bound — the idle
   * window slides inside it, it does not replace it.
   */
  refresh(sessionId: string): Promise<void>;

  /**
   * Reads the effective roles of an account, live.
   */
  effectiveRoles(userId: string): Promise<EffectiveAccess>;
}
