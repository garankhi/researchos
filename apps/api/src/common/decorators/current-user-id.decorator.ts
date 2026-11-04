import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth-principal.js';

/**
 * Injects the authenticated caller's user id into a handler parameter.
 *
 * ```typescript
 * @Get('me')
 * me(@CurrentUserId() userId: string): MeDto {
 *   return this.authService.me(userId);
 * }
 * ```
 *
 * The parameter is `string`, not `undefined`: the session guard has
 * already refused the request when there is no principal, so a handler
 * behind it always has one. The decorator therefore throws rather than
 * handing `undefined` to a service that would then have to guess.
 *
 * The id is a UUID, and the guard does not check its shape — the id came
 * from the database, so it is one.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<{
      principal?: AuthPrincipal;
    }>();

    const principal = request.principal;

    if (!principal) {
      throw new Error(
        'CurrentUserId was used on a route that is not behind the session guard.',
      );
    }

    return principal.userId;
  },
);
