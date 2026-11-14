import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolveEnvFilePaths } from '@researchos/config';
import { PrismaModule } from '@researchos/database';
import { JobsModule } from './modules/jobs/jobs.module.js';

/**
 * Composition root for the worker.
 *
 * Runs as an application context. JobsModule registers BullMQ and processors;
 * this app has no HTTP listener.
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
      // `.env` overrides them for this app only. Both src and dist are
      // direct children of the worker package.
      envFilePath: resolveEnvFilePaths(resolve(import.meta.dirname, '..')),
    }),
    PrismaModule,
    JobsModule,
  ],
})
export class AppModule {}
