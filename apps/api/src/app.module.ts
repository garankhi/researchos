import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolveEnvFilePaths } from '@researchos/config';
import { PrismaModule } from '@researchos/database';
import { DemoModule } from './modules/demo/demo.module.js';
import { HealthModule } from './modules/health/health.module.js';

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
      envFilePath: resolveEnvFilePaths(resolve(import.meta.dirname, '..', '..')),
    }),
    PrismaModule,
    DemoModule,
    HealthModule,
  ],
})
export class AppModule {}
