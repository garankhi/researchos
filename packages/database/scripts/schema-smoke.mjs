// Runs the SQL smoke tests against a scratch database.
//
// Run with: pnpm db:smoke
//
// The smoke tests are plain SQL files under `docs/database/`. They assert
// the behaviour of the schema — the constraints, the triggers, the views
// and the functions — against a database that holds nothing but fixtures.
// They are the only tests that reach the parts of the schema that Prisma
// cannot express, so they are the only thing that notices when a trigger
// or a function stops doing what the schema says it does.
//
// The tests run against **two** builds of the same schema:
//
//   1. The schema source, `docs/database/ResearchOS.sql`, which is the
//      source of truth for the tables, the constraints, the views, the
//      triggers and the functions.
//
//   2. The migration chain, `packages/database/prisma/migrations/`, which
//      is what an existing database is actually upgraded with.
//
// Both have to pass, and they have to pass for the same reason: a change
// to the schema source that is not mirrored by a migration leaves an
// existing database on the old behaviour, and no other test would notice.
//
// The script is plain Node, so it needs no `psql` on the PATH and runs the
// same way on every machine. It never touches the development database: it
// creates its own database and drops it again.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { resolveDatabaseUrl } from './database-url.mjs';
import { fail, log } from './openalex.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(packageRoot, '..', '..');

const DATABASE_DIR = resolve(workspaceRoot, 'docs', 'database');
const MIGRATIONS_DIR = resolve(packageRoot, 'prisma', 'migrations');

/**
 * The smoke tests, in the order they are run.
 *
 * The list is explicit rather than a glob, so that adding a file is a
 * deliberate act: a test that is never run is worse than no test at all,
 * because it reads like coverage.
 */
const SMOKE_FILES = [
  'schema-smoke.sql',
  'schema-auth-smoke.sql',
  'schema-policy-smoke.sql',
  'schema-search-smoke.sql',
  'schema-search-rebuild-smoke.sql',
];

/**
 * The scratch database. It is created and dropped by this script, so the
 * name says what it is for.
 */
const SCRATCH_DATABASE = 'researchos_smoke';

/**
 * The connection string of the `postgres` maintenance database, used to
 * create and drop the scratch database.
 */
function adminUrl(devUrl) {
  const url = new URL(devUrl);
  url.pathname = '/postgres';
  return url.toString();
}

/**
 * The connection string of the scratch database.
 *
 * The connection string is edited rather than the parsed parts, because
 * the URL carries more than the parts the driver knows about: a
 * `host=/path/to/socket` query parameter points the driver at a unix
 * socket, and rebuilding the connection from the parsed parts would lose
 * it.
 */
function scratchUrl(devUrl) {
  const url = new URL(devUrl);
  url.pathname = `/${SCRATCH_DATABASE}`;
  return url.toString();
}

/**
 * Drops the scratch database if it exists, then creates it empty.
 *
 * The open connections are terminated first: a database that still has a
 * session attached cannot be dropped, and a previous failed run may have
 * left one behind.
 */
async function recreateScratchDatabase(url) {
  const client = new pg.Client({ connectionString: url });

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
      [SCRATCH_DATABASE],
    );

    await client.query(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}"`);
    await client.query(`CREATE DATABASE "${SCRATCH_DATABASE}"`);
  } catch (error) {
    if (error?.code === '42501') {
      fail(
        'The database user in DATABASE_URL may not create databases.\n' +
          `The smoke tests need to create the scratch database "${SCRATCH_DATABASE}".\n` +
          'Grant CREATEDB to that user, or point DATABASE_URL at an admin account.',
      );
    }

    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Drops the scratch database.
 */
async function dropScratchDatabase(url) {
  const client = new pg.Client({ connectionString: url });

  try {
    await client.connect();
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [SCRATCH_DATABASE],
    );
    await client.query(`DROP DATABASE IF EXISTS "${SCRATCH_DATABASE}"`);
  } finally {
    await client.end();
  }
}

/**
 * Strips the `psql` meta-commands from a SQL file.
 *
 * The smoke tests are written for `psql`, so they start with
 * `\set ON_ERROR_STOP on`. The Node driver does not understand a
 * backslash command, so the line is removed. Nothing else in the files
 * depends on `psql` — they are plain SQL that happens to run inside a
 * transaction the file opens itself.
 */
function stripMetaCommands(sql) {
  return sql.replace(/^\\.*$/gm, '');
}

/**
 * The part of a SQL file around a position.
 *
 * The position points into the file, so the lines around it are usually
 * what is needed to understand the failure.
 */
function contextAround(sql, position) {
  if (!position) {
    return '';
  }

  return sql.slice(Math.max(0, position - 600), position + 600);
}

/**
 * Applies a SQL file to the scratch database.
 */
async function applySql(client, file) {
  const sql = stripMetaCommands(readFileSync(file, 'utf8'));

  try {
    await client.query(sql);
  } catch (error) {
    const context = contextAround(sql, error.position ? Number(error.position) : 0);

    fail(
      `Failed to apply ${file}.\n\n${error.message}\n` +
        (context ? `\n--- around the error ---\n${context}\n` : ''),
    );
  }
}

/**
 * Runs one smoke test against the scratch database.
 *
 * A failing assertion raises an exception, which aborts the transaction
 * the test file opened. That is the intended behaviour: the file rolls
 * itself back, so a failed run leaves no fixtures behind.
 */
async function runSmokeFile(client, file) {
  const sql = stripMetaCommands(readFileSync(file, 'utf8'));

  try {
    await client.query(sql);
  } catch (error) {
    // The message of a failed assertion carries the text of the
    // assertion, which says what was expected.
    const context = contextAround(sql, error.position ? Number(error.position) : 0);

    fail(
      `The smoke test failed: ${file}\n\n${error.message}\n` +
        (context ? `\n--- around the error ---\n${context}\n` : ''),
    );
  }
}

/**
 * The migration files, in the order they have to be applied.
 *
 * The directory name carries the timestamp, so a lexical sort is the
 * chronological order.
 */
function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => /^\d+_/.test(entry))
    .sort()
    .map((entry) => resolve(MIGRATIONS_DIR, entry, 'migration.sql'));
}

/**
 * Builds the schema from the schema source.
 *
 * The init migration comes first: it holds `audit_logs` and the enums
 * that predate the domain schema, and they are not in `ResearchOS.sql`.
 */
async function buildFromSchemaSource(client) {
  await applySql(
    client,
    resolve(MIGRATIONS_DIR, '20261031000000_init', 'migration.sql'),
  );
  await applySql(client, resolve(DATABASE_DIR, 'ResearchOS.sql'));
}

/**
 * Builds the schema from the migration chain.
 */
async function buildFromMigrations(client) {
  for (const file of migrationFiles()) {
    await applySql(client, file);
  }
}

/**
 * The two builds of the schema, and the name each is reported under.
 */
const BUILDS = [
  { name: 'schema source', build: buildFromSchemaSource },
  { name: 'migration chain', build: buildFromMigrations },
];

async function main() {
  const devUrl = resolveDatabaseUrl();
  const admin = adminUrl(devUrl);

  log('');
  log('ResearchOS schema smoke tests');
  log(`  scratch ${SCRATCH_DATABASE}`);
  log('');

  let failures = 0;

  for (const build of BUILDS) {
    log(`=== ${build.name} ===`);

    await recreateScratchDatabase(admin);

    // A fresh client per build: a failed smoke test leaves the session in
    // an aborted transaction, and the client cannot be reused after that.
    const scratch = new pg.Client({ connectionString: scratchUrl(devUrl) });

    try {
      await scratch.connect();

      await build.build(scratch);
      log(`  built the schema from the ${build.name}`);

      for (const file of SMOKE_FILES) {
        await runSmokeFile(scratch, resolve(DATABASE_DIR, file));
        log(`  PASS ${file}`);
      }
    } catch (error) {
      failures += 1;
      process.stderr.write(`\n${error.message}\n`);
    } finally {
      await scratch.end().catch(() => {});
      await dropScratchDatabase(admin).catch(() => {});
    }

    log('');
  }

  if (failures > 0) {
    fail(
      `${failures} of the ${BUILDS.length} schema builds failed.\n` +
        'The schema source and the migration chain must both satisfy the smoke tests.',
    );
  }

  log(`All ${SMOKE_FILES.length} smoke tests passed against both builds.`);
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
