/**
 * The request-scoped identity of the caller.
 *
 * This is a plain type, not an entity: it describes who the caller is for
 * the length of one request, and it carries nothing that belongs to the
 * database. A principal is built by the identity module and handed to the
 * guards through the request.
 *
 * ## Why it lives in `common/`
 *
 * The guard has to know what a principal looks like, and the identity
 * module has to be able to build one. Putting the type in the shared leaf
 * is what keeps the dependency graph a tree: `common/auth/` imports
 * nothing, `common/guards/` imports only this folder, and
 * `modules/identity/` implements the resolver that produces one.
 *
 * No business entity is named here — no `Profile`, no `Opportunity`, no
 * `Group`. `common/` is cross-cutting, and a domain name in it would tie
 * the whole app to one module.
 */

/**
 * How the caller proved who they are.
 *
 * `LOCAL` is a local credential check; `OIDC` is the institutional SSO.
 * The FPTU SSO protocol is not settled yet, so `LOCAL` is the only
 * implementation in place — but the value travels on the principal, so a
 * caller can tell the two apart without inspecting the session row.
 */
export type AuthMethod = 'LOCAL' | 'OIDC';

/**
 * The identity of the caller for the duration of one request.
 *
 * `roles` is a snapshot of what the guard read *for this request*. It is
 * not a snapshot stored on the session: roles are read live, so a revoked
 * grant takes effect on the next request rather than the next login.
 */
export interface AuthPrincipal {
  /** The id of the authenticated account. */
  userId: string;
  /** The id of the session the request was authenticated with. */
  sessionId: string;
  /** How the caller proved who they are. */
  authMethod: AuthMethod;
  /** LOCAL credentials must be replaced before normal protected access. */
  mustChangePassword: boolean;
  /** The roles the account currently holds. */
  roles: string[];
  /** The account's email address. */
  email: string;
  /** The account's display name. */
  fullName: string;
}
