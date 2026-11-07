import { describe, expect, it } from 'vitest';
import { access_role } from '@researchos/database';
import { ROLES } from './roles.js';

/**
 * `ROLES` is the database's `access_role` enum, re-exported under the name
 * the API reads at a call site.
 *
 * The check below pins the vocabulary itself. The enum is generated from
 * the Prisma schema, so a change to `access_role` in the schema changes
 * this list without anyone touching the API. That is the point — but it
 * also means the API would silently start asking for a role the platform
 * no longer grants. The test names that change so it is a deliberate one.
 */
describe('ROLES', () => {
  it('is the database role vocabulary', () => {
    expect(ROLES).toBe(access_role);
  });

  it('names exactly the two roles the platform grants', () => {
    expect(new Set(Object.values(ROLES))).toEqual(
      new Set(['ADMIN', 'RESEARCHER']),
    );
  });
});
