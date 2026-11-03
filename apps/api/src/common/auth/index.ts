/**
 * The shared auth leaf.
 *
 * A guard can be read without opening the identity module, and the
 * identity module can be read without opening a guard. That is the whole
 * point of this folder: it holds the contract both sides agree on, and
 * nothing else.
 */

export type { AuthMethod, AuthPrincipal } from './auth-principal.js';
export { SESSION_RESOLVER } from './session-resolver.js';
export type { EffectiveAccess, SessionResolver } from './session-resolver.js';
