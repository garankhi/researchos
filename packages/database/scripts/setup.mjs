// Sets up a local database from scratch.
//
// The script creates the database when it is missing, applies the migrations
// and then seeds the taxonomy from the snapshot that is committed to the
// repository. A new machine therefore needs no network access and no OpenAlex
// API key.
//
// Usage from the repository root:
//   pnpm db:setup
//
// Optional environment variables:
//   DATABASE_URL            Overrides the connection string from the .env file.
//
// The script is plain Node, so that it runs the same way on every machine.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  parseDatabaseUrl,
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
 * Creates the database when it does not exist yet.
 *
 * The Docker stack creates it on its own, because the compose file sets
 * POSTGRES_DB. This is the fallback for a PostgreSQL that is not managed by
 * compose, where the database has to be created by hand.
 *
 * The check and the creation run against the maintenance database, so that
 * the target database does not have to exist yet.
 */
async function createDatabaseIfMissing(target) {
  const client = new pg.Client({
    host: target.host,
    port: Number(target.port),
    user: target.user,
    password: target.password,
    database: 'postgres',
  });

  try {
    await client.connect();
  } catch (error) {
    fail(
      `Cannot connect to PostgreSQL as '${target.user}' on ${target.host}:${target.port}.\n` +
        `${error.message}\n` +
        'Start the local dependencies first: pnpm infra:up',
    );
  }

  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [target.database],
    );

    if (existing.rowCount > 0) {
      log(`The database '${target.database}' already exists.`);
      return;
    }

    log(`Creating the database '${target.database}' ...`);

    // The database name cannot be a bound parameter in a CREATE DATABASE
    // statement, so it is quoted instead. The name comes from the
    // connection string, which the operator controls.
    await client.query(`CREATE DATABASE "${target.database.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  const target = parseDatabaseUrl(databaseUrl);

  log('');
  log('ResearchOS database setup');
  log(`  database ${target.user}@${target.host}:${target.port}/${target.database}`);
  log('');

  await createDatabaseIfMissing(target);

  log('');
  log('Applying the migrations ...');
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);

  log('');
  log('Seeding the taxonomy from the local snapshot ...');
  run('pnpm', ['run', 'db:seed']);

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
