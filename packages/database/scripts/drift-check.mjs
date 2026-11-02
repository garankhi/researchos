// Checks that the committed Prisma datamodel still describes the schema
// source. Run with: pnpm db:drift
//
// The schema lives in two places, and they drift.
//
// `docs/database/ResearchOS.sql` is the source of truth: tables, CHECK
// constraints, deferrable foreign keys, expression indexes, views, triggers
// and functions. Prisma cannot express most of that, so it lives in the SQL
// and is enforced by PostgreSQL.
//
// `packages/database/prisma/schema.prisma` is a *copy* of that SQL, used to
// generate the client. A copy that is refreshed by hand drifts the moment
// someone edits the SQL and forgets to re-introspect.
//
// This check rebuilds a scratch database from the SQL, then compares it with
// the committed datamodel. It never touches the development database: it
// creates its own database, and drops it again.
//
// The comparison is a Prisma `migrate diff`, not a text diff. Introspection
// reorders models, renames back-relations and rewrites formatting, so a
// textual comparison would report noise on every run. The diff asks the
// question that actually matters: "would applying this datamodel to the
// database change anything?"
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(packageRoot, '..', '..');

const SQL_SOURCE = resolve(workspaceRoot, 'docs', 'database', 'ResearchOS.sql');
const INIT_MIGRATION = resolve(
  packageRoot,
  'prisma',
  'migrations',
  '20261031000000_init',
  'migration.sql',
);
const SCHEMA = resolve(packageRoot, 'prisma', 'schema.prisma');

/**
 * The scratch database. It lives on the same server as the development
 * database so that no additional infrastructure is needed, and it is
 * recreated on every run so a failed run cannot leave a stale state behind.
 */
const SCRATCH_DATABASE = 'researchos_drift';

function log(message) {
  process.stdout.write(`${message}\n`);
}

/**
 * Reports a failure and ends the run.
 *
 * This throws rather than calling `process.exit`, so the `finally` block in
 * `main` still runs and the scratch database is dropped. A failed check that
 * leaves a database behind would make the next run start from a dirty state.
 */
class DriftCheckError extends Error {}

function fail(message) {
  throw new DriftCheckError(message);
}

/**
 * The connection string of the scratch database, derived from the
 * development one.
 *
 * The scratch database has to live on the same server: the schema uses
 * `pg_trgm` and other extensions, and standing up a second server for a
 * one-off check is not worth it.
 */
function scratchUrl(devUrl) {
  const url = new URL(devUrl);
  url.pathname = `/${SCRATCH_DATABASE}`;
  return url.toString();
}

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
 * Reads `DATABASE_URL` the way the Prisma CLI does: the package-local `.env`
 * overrides the workspace root `.env`, and a real environment variable
 * overrides both.
 *
 * The Prisma config loads those files with `override: true`, so an
 * environment variable set by the caller would normally lose against the
 * `.env` file. The drift check therefore reads the files itself, and only
 * falls back to the environment when no file provides a value — which keeps
 * `pnpm db:drift` usable in CI, where there is no `.env` file.
 */
function resolveDevDatabaseUrl() {
  for (const path of [
    resolve(packageRoot, '.env.local'),
    resolve(packageRoot, '.env'),
    resolve(workspaceRoot, '.env'),
  ]) {
    let contents;
    try {
      contents = readFileSync(path, 'utf8');
    } catch {
      continue;
    }

    const match = /^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(contents);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  return fail(
    'DATABASE_URL is not set. The drift check needs a PostgreSQL connection string.\n' +
      'Set it in the root .env file or in the environment.',
  );
}

/**
 * Runs a command and captures its output.
 *
 * The output is captured rather than inherited so that the Prisma CLI's own
 * logging does not end up in the middle of the drift report.
 */
function run(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? packageRoot,
      shell: process.platform === 'win32',
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

/**
 * Runs a callback with a Prisma config that points at the scratch
 * database.
 *
 * The Prisma CLI cannot take a connection string as an argument — `migrate
 * diff` lost `--from-url` in Prisma 7 — so the URL is passed through a
 * generated config file instead. Generating it per run keeps the scratch
 * URL out of the committed tree.
 */
async function withScratchConfig(url, callback) {
  const configPath = resolve(packageRoot, 'prisma.drift.generated.ts');

  await writeFile(
    configPath,
    [
      "import { defineConfig } from 'prisma/config';",
      '',
      'export default defineConfig({',
      "  schema: 'prisma/schema.prisma',",
      "  migrations: { path: 'prisma/migrations' },",
      '  datasource: {',
      `    url: ${JSON.stringify(url)},`,
      '  },',
      '});',
      '',
    ].join('\n'),
    'utf8',
  );

  try {
    return await callback(configPath);
  } finally {
    await rm(configPath, { force: true });
  }
}

/**
 * Drops the scratch database if it exists, then creates it empty.
 *
 * The database is created empty rather than by applying the migrations,
 * because the point of the check is to build the schema from the SQL source.
 */
async function recreateScratchDatabase(url) {
  const client = new Client({ connectionString: url });
  await client.connect();

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
        `The database user in DATABASE_URL may not create databases.\n` +
          `The drift check needs to create the scratch database "${SCRATCH_DATABASE}".\n` +
          'Grant CREATEDB to that user, or point DATABASE_URL at an admin account.',
      );
    }

    throw error;
  } finally {
    await client.end();
  }
}

async function dropScratchDatabase(url) {
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
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
 * Applies a SQL file to the scratch database.
 *
 * `prisma db execute` is used rather than `psql`, so the check needs no
 * PostgreSQL client on the PATH — it works in CI with nothing but Node.
 */
async function applySql(url, file) {
  const result = await withScratchConfig(url, (configPath) =>
    run('pnpm', ['exec', 'prisma', 'db', 'execute', '--config', configPath, '--file', file]),
  );

  if (result.code !== 0) {
    fail(
      `Failed to apply ${file} to the scratch database.\n${result.stdout}\n${result.stderr}`,
    );
  }
}

async function main() {
  const devUrl = resolveDevDatabaseUrl();
  const admin = adminUrl(devUrl);
  const scratch = scratchUrl(devUrl);

  log('ResearchOS schema drift check');
  log(`  source    ${SQL_SOURCE}`);
  log(`  datamodel ${SCHEMA}`);
  log(`  scratch   ${scratch}`);
  log('');

  log('Creating the scratch database ...');
  await recreateScratchDatabase(admin);

  try {
    // The init migration holds `audit_logs` and the four enums that predate
    // the domain schema. They are not in `ResearchOS.sql`, so the scratch
    // database is built from both, in migration order.
    log('Applying the init migration (audit_logs, base enums) ...');
    await applySql(scratch, INIT_MIGRATION);

    log('Applying the schema source (ResearchOS.sql) ...');
    await applySql(scratch, SQL_SOURCE);

    log('Comparing the scratch database with the committed datamodel ...');
    const diff = await withScratchConfig(scratch, (configPath) =>
      run('pnpm', [
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--config',
        configPath,
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--script',
      ]),
    );

    const output = `${diff.stdout}\n${diff.stderr}`;
    const isEmpty = output.includes('-- This is an empty migration.');

    if (diff.code !== 0) {
      fail(`The comparison failed.\n${output}`);
    }

    if (!isEmpty) {
      fail(
        'The committed datamodel no longer matches the schema source.\n\n' +
          'The diff below is what would have to change in the database.\n' +
          'Either the SQL source changed without a re-introspection, or\n' +
          'schema.prisma was edited by hand.\n\n' +
          'To refresh the datamodel, apply the SQL to a scratch database, run\n' +
          '`prisma db pull --print`, review the output, and update\n' +
          'prisma/schema.prisma. The two back-relations listed in\n' +
          'docs/database-prisma-sync.md must stay as lists.\n\n' +
          output,
      );
    }

    log('');
    log('No drift. The committed datamodel matches the schema source.');
  } finally {
    log('Dropping the scratch database ...');
    await dropScratchDatabase(admin);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof DriftCheckError) {
    process.stderr.write(`\n${error.message}\n`);
    process.exit(1);
  }

  throw error;
}
