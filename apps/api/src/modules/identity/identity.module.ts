import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SESSION_RESOLVER } from '../../common/auth/session-resolver.js';
import { RoleGuard } from '../../common/guards/role.guard.js';
import { SessionGuard } from '../../common/guards/session.guard.js';
import { AccessService } from './access.service.js';
import { SessionService } from './session.service.js';

/**
 * The identity module.
 *
 * It owns `users`, `user_sessions`, `user_role_assignments` and
 * `local_credentials`, and it is the module that exports the session
 * resolver the guards ask.
 *
 * ## The dependency tree
 *
 * ```text
 * common/auth/          <- the shared leaf: principal type + resolver contract
 * common/guards/        <- SessionGuard, RoleGuard (depend on the leaf only)
 * modules/identity/     <- this module: the implementation and the endpoints
 * ```
 *
 * `common/guards/` imports only `common/auth/`. It never imports this
 * module, and this module never imports a guard's internals — the two
 * sides meet at the `SESSION_RESOLVER` token.
 *
 * ## Why the guard is a provider here
 *
 * The session guard is registered as an `APP_GUARD` **in this module**,
 * not through `app.useGlobalGuards(new SessionGuard(...))` in `main.ts`.
 * A guard that injects `SESSION_RESOLVER` needs the DI container to
 * resolve it, and a hand-built instance has no container. Registering it
 * as a provider keeps the guard global and injectable at the same time.
 *
 * ## `useExisting`, not `useClass`
 *
 * `SESSION_RESOLVER` is bound to the **same** `SessionService` instance
 * the module provides. Two instances would mean two connection pools and
 * two sources of truth for the session rules.
 */
@Module({
  providers: [
    AccessService,
    SessionService,

    // The resolver the guards ask. It is the session service itself, so
    // there is exactly one implementation of the session rules.
    { provide: SESSION_RESOLVER, useExisting: SessionService },

    // Global guards, in the order they run.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [SESSION_RESOLVER, AccessService, SessionService],
})
export class IdentityModule {}
