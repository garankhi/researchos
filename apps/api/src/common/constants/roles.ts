import { access_role } from '@researchos/database';

/**
 * The role names the platform knows.
 *
 * A role is an access level a caller may hold. The names come from the
 * database's own `access_role` enum, so there is exactly one definition of
 * the vocabulary: a role the database cannot store is a role no account
 * can ever hold, and a role the API invents is a role the guard could
 * never grant.
 *
 * ## Why this is a re-export and not a second list
 *
 * The enum is the contract. The grant row stores it, the `is_admin` /
 * `is_researcher` view reads it, and the guard compares against it. A
 * hand-written list next to the enum is a list that can drift — and a
 * drifted list fails silently: a route asking for a role nobody holds is
 * simply unreachable, with no error anywhere.
 *
 * ## Why the name is `ROLES` and not `access_role`
 *
 * `access_role` is the database's column name, which is snake_case because
 * the column is. `ROLES` is how the API reads at a call site:
 * `@Roles(ROLES.ADMIN)`. The values are identical.
 *
 * ## Why these are not business entities
 *
 * `common/` may not name a domain entity — no `Profile`, no `Opportunity`.
 * A role is not an entity: it is a label on a grant, and the guard needs
 * to know the vocabulary, not the table it lives in. The per-record checks
 * (ownership, membership, visibility) stay in the owning module's service.
 */
export const ROLES = access_role;

/**
 * One of the role names the platform knows.
 *
 * Derived from the enum, so a new role is added in the schema and every
 * consumer of the type follows automatically.
 */
export type Role = (typeof ROLES)[keyof typeof ROLES];
