import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolveEnvFilePaths } from '@researchos/config';

/**
 * Prisma CLI configuration for Prisma 7.
 *
 * The connection string is read from the environment instead of from the
 * `datasource` block in `schema.prisma`, which is the Prisma 7 convention.
 *
 * Environment file resolution follows the workspace convention: the package
 * local `.env` overrides the workspace root `.env`. The first file that
 * defines a variable wins, so the files are loaded in reverse priority order
 * with `override: true`.
 *
 * `DATABASE_URL` is optional here so that `prisma validate`, `prisma format`
 * and `prisma generate` work without database credentials. The commands that
 * actually need a database (`db pull`, `studio`) fail with a clear message
 * when it is missing.
 *
 * There is deliberately no `migrations` block and no `shadowDatabaseUrl`.
 * Prisma Migrate is not used in this workspace. The schema is owned by
 * `ResearchOS.sql` and `schema.prisma` is regenerated from the live database
 * by `pnpm --filter @researchos/database db:schema`. The reason is that the
 * schema contains CHECK constraints, DEFERRABLE foreign keys, expression
 * indexes, partial unique indexes, views and triggers that the Prisma schema
 * language cannot represent. Prisma Migrate's differ is blind to those
 * objects and a migration it generates would not reproduce the database, so
 * the schema would be split across two sources of truth with the SQL-owned
 * half invisible to the tool that claims to own the schema.
 */
const packageRoot = resolve(import.meta.dirname);

for (const path of resolveEnvFilePaths(packageRoot).reverse()) {
  loadEnv({ path, override: true });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
