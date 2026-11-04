import { Injectable } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import type { EffectiveAccess } from '../../common/auth/session-resolver.js';

/**
 * Reads the effective access of an account.
 *
 * The roles come from the `effective_user_access` view, so the
 * `FACULTY` → `RESEARCHER` baseline and the explicit `ADMIN` grant are
 * resolved in one place — the database. A caller never has to know that a
 * faculty account is a researcher without any role row.
 *
 * The roles are read live and are never snapshotted in the session, so a
 * revoked grant takes effect on the next request.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The effective roles of an account.
   *
   * An account the view does not know about has no access at all. The
   * view only lists accounts, so a missing row means the account is not
   * usable — not that it is a guest.
   */
  async effectiveRoles(userId: string): Promise<EffectiveAccess> {
    const rows = await this.prisma.$queryRaw<
      Array<{ is_researcher: boolean; is_admin: boolean }>
    >`
      SELECT is_researcher, is_admin
      FROM effective_user_access
      WHERE user_id = ${userId}
    `;

    const access = rows[0];

    if (!access) {
      return { isResearcher: false, isAdmin: false };
    }

    return {
      isResearcher: access.is_researcher,
      isAdmin: access.is_admin,
    };
  }
}
