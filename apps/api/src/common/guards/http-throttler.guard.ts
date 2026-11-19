import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Applies NestJS HTTP rate-limiting only on HTTP requests so WebSocket
 * gateways do not fail when `ThrottlerGuard` attempts to set Express headers.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (typeof context.getType === 'function' && context.getType() === 'ws') {
      return true;
    }
    return super.canActivate(context);
  }
}
