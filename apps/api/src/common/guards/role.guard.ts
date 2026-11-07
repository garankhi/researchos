import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator.js';
import { ROLES, type Role } from '../constants/roles.js';
import { SESSION_RESOLVER } from '../auth/session-resolver.js';
import type { SessionResolver } from '../auth/session-resolver.js';
import { PRINCIPAL_REQUEST_KEY } from './session.guard.js';
import type { AuthPrincipal } from '../auth/auth-principal.js';

/**
 * Refuses a request that is signed in but does not hold the required role.
 *
 * The guard asks `SESSION_RESOLVER` for the caller's effective roles. The
 * roles are read **live** — never snapshotted in the session — so a
 * revoked grant takes effect on the next request rather than the next
 * login.
 *
 * ## What this guard is not
 *
 * It is not a record-level check. "Is this user allowed to see *this*
 * output?" depends on the record — its owner, its group, its visibility —
 * so it stays in the owning module's service, where the record is known.
 * A guard that could answer that would have to know every domain entity,
 * which is exactly what `common/` must not do.
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    @Inject(SESSION_RESOLVER) private readonly resolver: SessionResolver,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const principal = (request as unknown as Record<string, unknown>)[
      PRINCIPAL_REQUEST_KEY
    ] as AuthPrincipal | undefined;

    if (!principal) {
      // The session guard runs first and refuses an unauthenticated
      // request, so this only happens when the role guard is used on its
      // own. A 401 is the honest answer: the caller is not signed in.
      throw new UnauthorizedException();
    }

    const access = await this.resolver.effectiveRoles(principal.userId);

    const granted = new Set<Role>();

    if (access.isAdmin) {
      granted.add(ROLES.ADMIN);
    }

    if (access.isResearcher) {
      granted.add(ROLES.RESEARCHER);
    }

    const allowed = requiredRoles.every((role) => granted.has(role));

    if (!allowed) {
      throw new ForbiddenException();
    }

    return true;
  }
}
