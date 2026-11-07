// Tears the development database down and builds it again from scratch.
//
// Run with: pnpm db:reset
//
// The run is deliberately destructive: every row in the target database is
// lost, including rows that the seed never wrote. It is meant for the local
// development machine, where the database can always be rebuilt from the
// migrations and the committed snapshot.
//
// The steps are:
//
//   1. Drop the target database and create it empty.
//   2. Apply the migrations with `prisma migrate deploy`.
//   3. Seed the taxonomy from the committed snapshot, together with the
//      development accounts and the demo records.
//
// Step 3 uses the offline seed, so the run needs no network and no OpenAlex
// API key. The online variant, which fetches the taxonomy from OpenAlex, is
// `pnpm db:seed:online` and has to be run separately.
//
// The seed imports the compiled Prisma client from `dist/`, so the package
// has to be built before this script runs. The `db:reset` script in
// package.json takes care of that.
//
// Usage from the repository root:
//   pnpm db:reset
//
// Optional environment variables:
//   DATABASE_URL   Overrides the connection string from the .env file.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  parseDatabaseUrl,
  redactDatabaseUrl,
  resolveDatabaseUrl,
} from './database-url.mjs';
import { fail, log } from './openalex.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Runs a command and ends the run when it fails.
 */
function run(command, args) {
  log(`  $ ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    fail(`The command failed: ${command} ${args.join(' ')}`);
  }
}

/**
 * The connection string of the `postgres` maintenance database.
 *
 * The drop and the create run against the maintenance database, because the
 * target database cannot be dropped while it is the one being connected to.
 */
function maintenanceUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
}

/**
 * Drops the target database and creates it empty.
 *
 * The open connections are terminated first: a database that still has a
 * session attached cannot be dropped, and the development machine usually
 * has one left over from the running application.
 */
async function recreateDatabase(adminUrl, database) {
  const client = new pg.Client({ connectionString: adminUrl });

  try {
    await client.connect();
  } catch (error) {
    fail(
      `Cannot connect to PostgreSQL: ${error.message}\n` +
        'Start the local dependencies first: pnpm infra:up',
    );
  }

  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [database],
    );

    // The name cannot be a bound parameter in a DROP or CREATE DATABASE
    // statement, so it is quoted instead. The name comes from the
    // connection string, which the operator controls.
    await client.query(`DROP DATABASE IF EXISTS "${database.replace(/"/g, '""')}"`);
    await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
  } catch (error) {
    if (error?.code === '42501') {
      fail(
        'The database user in DATABASE_URL may not create databases.\n' +
          'Grant CREATEDB to that user, or point DATABASE_URL at an admin account.',
      );
    }

    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  const target = parseDatabaseUrl(databaseUrl);

  log('');
  log('ResearchOS database reset');
  log(`  database ${redactDatabaseUrl(databaseUrl)}`);
  log('');

  log('Dropping and recreating the database ...');
  await recreateDatabase(maintenanceUrl(databaseUrl), target.database);

  log('');
  log('Applying the migrations ...');
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);

  log('');
  log('Seeding the taxonomy from the local snapshot ...');
  run('node', ['scripts/seed.mjs']);

  log('');
  log('The database is ready.');
}

try {
  await main();
} catch (error) {
  if (error?.name === 'SeedError') {
    process.stderr.write(`\n${error.message}\n`);
    process.exit(1);
  }

  throw error;
}
