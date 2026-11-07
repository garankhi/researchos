import { createHash } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & { actorId: string };

/** Validates an opaque app session; never accepts a client-supplied actor ID. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match || match[1].length > 4096)
      throw new UnauthorizedException('A valid app session is required');
    const hash = createHash('sha256').update(match[1]).digest('hex');
    const sessions = await this.prisma.$queryRaw<{ userId: string }[]>`
      SELECT s.user_id AS "userId" FROM active_user_sessions s
      WHERE s.session_token_hash = ${hash}
        AND (s.auth_method <> 'LOCAL' OR EXISTS (
          SELECT 1 FROM local_credentials c
          WHERE c.user_id = s.user_id AND NOT c.must_change_password
        ))
    `;
    if (!sessions[0])
      throw new UnauthorizedException(
        'Session expired, revoked or password change required',
      );
    request.actorId = sessions[0].userId;
    return true;
  }
}
