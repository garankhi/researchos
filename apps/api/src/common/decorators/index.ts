/**
 * The shared parameter decorators.
 *
 * They know about the request and about the principal — nothing else. No
 * business entity is named here.
 */

export { CurrentUserId } from './current-user-id.decorator.js';
export { CurrentPrincipal } from './current-principal.decorator.js';
export { AllowPasswordChangePending } from './allow-password-change-pending.decorator.js';
export { IS_PUBLIC_KEY, Public } from './public.decorator.js';
export { ROLES_METADATA_KEY, Roles } from './roles.decorator.js';
