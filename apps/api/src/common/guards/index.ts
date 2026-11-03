/**
 * The cross-cutting guards.
 *
 * They depend on `common/auth/` and on nothing else — no table, no
 * entity, no module. The identity module implements the resolver they
 * ask.
 */

export {
  PRINCIPAL_REQUEST_KEY,
  SessionGuard,
  type AuthenticatedRequest,
} from './session.guard.js';
export { RoleGuard } from './role.guard.js';
