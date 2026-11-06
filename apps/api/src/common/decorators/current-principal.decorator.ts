import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth-principal.js';

/** Injects the request's authenticated principal without coupling a handler
 * to guard implementation details. Only use on authenticated routes. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const principal = context
      .switchToHttp()
      .getRequest<{ principal?: AuthPrincipal }>().principal;
    if (!principal)
      throw new Error('CurrentPrincipal requires an authenticated route.');
    return principal;
  },
);
