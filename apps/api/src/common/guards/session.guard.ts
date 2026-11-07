import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie.js';
import { SESSION_RESOLVER } from '../auth/session-resolver.js';
import type { SessionResolver } from '../auth/session-resolver.js';
import type { AuthPrincipal } from '../auth/auth-principal.js';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from '../decorators/allow-password-change-pending.decorator.js';
import { CodedHttpException, domainErrorCodes } from '../errors/error-codes.js';

/**
 * The request property the resolved principal is attached to.
 *
 * It is exported so a controller can read the principal directly when it
 * needs more than the user id — the `CurrentUserId` decorator covers the
 * common case.
 */
export const PRINCIPAL_REQUEST_KEY = 'principal';

/**
 * Turns every request into an authenticated request.
 *
 * The guard reads the opaque session cookie, hands the **raw** token to
 * `SESSION_RESOLVER` and attaches the returned principal to the request.
 * It never hashes the token itself and never touches a session table — the
 * resolver owns all of that, which is what keeps `common/` free of the
 * identity module.
 *
 * ## Why a missing cookie is a 401 and not a 500
 *
 * "Not signed in" is an expected state, not a failure of the server. A
 * missing cookie, a malformed cookie, an expired session and a revoked
 * session all mean the same thing to the caller, and all of them are
 * `UnauthorizedException`. An exception filter turns that into the standard
 * error envelope with the generic `unauthorized` code.
 *
 * ## Why the guard is an `APP_GUARD`
 *
 * It is registered as a provider, not through `app.useGlobalGuards(new
 * SessionGuard(...))`. A guard that injects `SESSION_RESOLVER` needs the
 * DI container to resolve it, and a hand-built instance has no container.
 * Registering it as a provider keeps the guard global *and* injectable.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(SESSION_RESOLVER) private readonly resolver: SessionResolver,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.readToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const principal = await this.resolver.resolve(token);

    if (!principal) {
      throw new UnauthorizedException();
    }

    if (
      principal.mustChangePassword &&
      !this.reflector.get<boolean>(
        ALLOW_PASSWORD_CHANGE_PENDING_KEY,
        context.getHandler(),
      )
    ) {
      throw new CodedHttpException(
        domainErrorCodes.identity.mustChangePassword,
        HttpStatus.FORBIDDEN,
      );
    }

    // The session is alive, so its idle window slides forward. A failure
    // here must not fail the request: the session was already validated,
    // and the refresh is a bookkeeping write.
    await this.resolver.refresh(principal.sessionId).catch(() => undefined);

    (request as Request & Record<string, unknown>)[PRINCIPAL_REQUEST_KEY] =
      principal;

    return true;
  }

  /**
   * Reads the raw token out of the request cookie.
   *
   * The raw value is what the resolver hashes, so it must not be touched
   * on the way out — no trimming, no case folding.
   */
  private readToken(request: Request): string | undefined {
    const cookies = request.cookies as
      Record<string, string | undefined> | undefined;

    const token = cookies?.[SESSION_COOKIE_NAME];

    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }
}

/**
 * The type of a request that carries a resolved principal.
 */
export type AuthenticatedRequest = Request & {
  [PRINCIPAL_REQUEST_KEY]: AuthPrincipal;
};
