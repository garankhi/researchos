import { ApiProperty } from '@nestjs/swagger';

/**
 * The payload of `POST /auth/logout`.
 *
 * It is the bare payload — the response envelope is applied by the global
 * interceptor, so this class never carries `success` or `data`.
 *
 * `revoked` says whether a session was actually revoked. It is `false`
 * when the request carried no session cookie, or when the session was
 * already revoked: in both cases the caller ends up signed out either
 * way, so a logout is never a failure.
 */
export class LogoutDto {
  @ApiProperty({
    description: 'Whether a session was revoked.',
    example: true,
  })
  revoked: boolean;
}
