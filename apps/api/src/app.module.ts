import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { resolveEnvFilePaths } from '@researchos/config';
import { PrismaModule } from '@researchos/database';
import { DemoModule } from './modules/demo/demo.module.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import { FollowModule } from './modules/follow/follow.module.js';
import { GroupsModule } from './modules/groups/groups.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { OpenAlexModule } from './modules/openalex/openalex.module.js';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module.js';
import { OutputsModule } from './modules/outputs/outputs.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { ProvenanceModule } from './modules/provenance/provenance.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module.js';

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

    // The rate limiter. A login without one is an open credential-stuffing
    // target, so the limit is part of the platform's contract rather than
    // a per-route decoration.
    //
    // The default is deliberately loose — it is a backstop against a
    // runaway client, not a quota. The login route tightens it further
    // with `@Throttle`.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),

    DemoModule,
    DiscoveryModule,
    FollowModule,
    GroupsModule,
    HealthModule,
    IdentityModule,
    JobsModule,
    OpenAlexModule,
    OpportunitiesModule,
    OutputsModule,
    ProfilesModule,
    ProvenanceModule,
    StorageModule,
    TaxonomyModule,
  ],
})
export class AppModule {}
