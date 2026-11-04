import { SetMetadata } from '@nestjs/common';

/**
 * The metadata key the role requirement is stored under.
 *
 * The `RoleGuard` reads it; nothing else does.
 */
export const ROLES_METADATA_KEY = 'researchos:roles';

/**
 * Declares the roles a route requires.
 *
 * ```typescript
 * @Roles('ADMIN')
 * @Get('users')
 * listUsers(): UsersDto {
 *   ...
 * }
 * ```
 *
 * The guard refuses the request with a `403` when the caller is signed in
 * but does not hold every listed role. A route with no `@Roles` is open
 * to any signed-in caller — the session guard still applies.
 *
 * Per-record checks — ownership, group membership, a record's visibility —
 * are not roles and do not belong here. They stay in the owning module's
 * service, where the record is known.
 */
export const Roles = (...roles: string[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);
