import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolveEnvFilePaths } from '@researchos/config';
import { PrismaModule } from '@researchos/database';
import { HealthModule } from './modules/health/health.module.js';

/**
 * Composition root for the worker.
 *
 * The worker is still an HTTP scaffold: it has no queue or processor
 * registered yet, so it keeps a plain HTTP bootstrap. Convert this to
 * `NestFactory.createApplicationContext` when the first BullMQ processor
 * is added — see docs/scaffolding.md.
 *
 * Processors live in `src/processors/`, one file per job type.
 *
 * The worker shares the database package with the API: both talk to the same
 * PostgreSQL instance, and neither imports the other's source.
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
    HealthModule,
  ],
})
export class AppModule {}
