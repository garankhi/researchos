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
 * actually need a database (`migrate`, `studio`) fail with a clear message
 * when it is missing.
 */
const packageRoot = resolve(import.meta.dirname);

for (const path of resolveEnvFilePaths(packageRoot).reverse()) {
  loadEnv({ path, override: true });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // The command that `prisma db seed` runs. The seed script imports the
    // compiled Prisma client from `dist/`, so the package has to be built
    // before it runs; `db:seed` in package.json does that.
    //
    // This is the offline seed, which reads the committed snapshot. The
    // online variant, which fetches the taxonomy from OpenAlex, is
    // `db:seed:online`.
    seed: 'node scripts/seed.mjs',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    // Optional. Postgres needs a separate schema to apply migrations against,
    // so `prisma migrate dev` needs a second database. Set
    // SHADOW_DATABASE_URL to point at one; otherwise Prisma creates and drops
    // a temporary database on the same server.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
