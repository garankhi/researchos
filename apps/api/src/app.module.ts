import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { resolveEnvFilePaths } from '@researchos/config';
import { PrismaModule } from '@researchos/database';
import { DemoModule } from './modules/demo/demo.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';

/**
 * Composition root.
 *
 * This file only wires feature modules together. Business wiring lives
 * inside each module under `src/modules/`; cross-cutting infrastructure
 * lives in `src/common/` and is registered here or per-module.
 *
 * `ConfigModule` is registered first and marked global so that every module
 * can read validated environment variables without re-importing it.
 * `PrismaModule` is global too, so feature modules get the database client
 * without every module having to import it.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // The workspace root `.env` holds the shared variables; an app-local
      // `.env` overrides them for this app only. This file lives in `src/`,
      // so the package root is two levels up.
      envFilePath: resolveEnvFilePaths(
        resolve(import.meta.dirname, '..', '..'),
      ),
    }),
    PrismaModule,

    // The rate limiter. The session guard is registered globally, so a
    // brute-force run against a protected route is bounded by the
    // platform rather than by each route remembering to ask for it.
    //
    // The default is deliberately loose — it is a backstop against a
    // runaway client, not a quota. A route that needs a tighter bound
    // tightens it further with `@Throttle`.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),

    DemoModule,
    HealthModule,
    IdentityModule,
    JobsModule,
  ],
})
export class AppModule {}
