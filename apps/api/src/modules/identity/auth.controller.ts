import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from '../../common/auth/session-cookie.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js';
import { AllowPasswordChangePending } from '../../common/decorators/allow-password-change-pending.decorator.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import { AuthService } from './auth.service.js';
import { resolveSessionTtls } from './session-ttl.js';
import { LoginDto } from './dto/login.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { MeDto } from './dto/me.dto.js';
import {
  ChangePasswordDto,
  ChangePasswordResultDto,
} from './dto/change-password.dto.js';

/**
 * The session endpoints.
 *
 * Session routes:
 *
 * - `POST /auth/login` — verifies a local credential and issues a session.
 * - `POST /auth/logout` — revokes the session behind the cookie.
 * - `GET /me` — the current user payload.
 * - `POST /auth/change-password` — replaces a LOCAL password and ends all sessions.
 *
 * The login route is public — it is how a caller becomes signed in. The
 * others are behind the session guard, which is registered globally.
 */
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @ApiOperation({
    summary: 'Signs in with a local credential and issues a session cookie',
  })
  @ApiOkResponse({ description: 'The signed-in user payload', type: MeDto })
  @ApiUnauthorizedResponse({
    description: 'The credential was rejected.',
  })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    // A login without a limit is an open credential-stuffing target, so
    // the limit is part of the platform's contract rather than a nicety.
    // Ten attempts a minute per client is far above what a person needs
    // and far below what a stuffing run needs.
    default: { limit: 10, ttl: 60_000 },
  })
  @Post('auth/login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeDto> {
    const { token, me } = await this.authService.login(dto);

    // The token rides an opaque cookie: HttpOnly so JavaScript cannot read
    // it, Secure so it never travels over plain HTTP, SameSite so it does
    // not ride a cross-site request. Only its hash is stored.
    const { absoluteTtlMs } = resolveSessionTtls(this.config);

    response.cookie(SESSION_COOKIE_NAME, token, {
      ...SESSION_COOKIE_OPTIONS,
      maxAge: absoluteTtlMs,
    });

    return me;
  }

  @ApiOperation({
    summary: 'Revokes the session behind the current cookie',
  })
  @ApiOkResponse({ description: 'The session was revoked.', type: LogoutDto })
  @ApiUnauthorizedResponse({ description: 'There is no session to revoke.' })
  @HttpCode(HttpStatus.OK)
  @AllowPasswordChangePending()
  @Post('auth/logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutDto> {
    const token = this.readToken(request);

    if (token) {
      await this.authService.logout(token);
    }

    // The cookie is cleared whatever the revocation did: the caller ends
    // up signed out either way.
    response.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);

    return { revoked: Boolean(token) };
  }

  @Post('auth/change-password')
  @HttpCode(HttpStatus.OK)
  @AllowPasswordChangePending()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Changes the LOCAL password and revokes all existing sessions',
  })
  @ApiOkResponse({
    description: 'Password changed. Sign in again using the new password.',
    type: ChangePasswordResultDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid new password or reuse of the current password.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Session expired/revoked or the current password was rejected.',
  })
  @ApiForbiddenResponse({
    description: 'Password changes require a LOCAL session.',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ChangePasswordResultDto> {
    await this.authService.changePassword(
      principal.userId,
      principal.sessionId,
      dto,
    );
    response.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);
    return { changed: true };
  }

  @ApiOperation({ summary: 'Returns the current user payload' })
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'The current user payload', type: MeDto })
  @ApiUnauthorizedResponse({
    description: 'There is no valid session behind the request.',
  })
  @Get('me')
  @AllowPasswordChangePending()
  me(@CurrentPrincipal() principal: AuthPrincipal): Promise<MeDto> {
    return this.authService.me(principal.userId, principal.authMethod);
  }

  /**
   * The raw session token out of the request cookie.
   */
  private readToken(request: Request): string | undefined {
    const cookies = request.cookies as
      Record<string, string | undefined> | undefined;

    const token = cookies?.[SESSION_COOKIE_NAME];

    return typeof token === 'string' && token.length > 0 ? token : undefined;
  }
}
