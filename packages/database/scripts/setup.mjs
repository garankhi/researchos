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
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { fail, log } from './openalex.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(packageRoot, '..', '..');

/**
 * Reads the connection string the way the Prisma CLI reads it: the
 * package-local `.env` overrides the workspace root `.env`, and a real
 * environment variable is used only when no file provides a value.
 */
function resolveDatabaseUrl() {
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
    'DATABASE_URL is not set. Copy .env.example to .env and fill it in.',
  );
}

/**
 * Parses a PostgreSQL connection string into its parts.
 *
 * The URL is parsed with the URL parser, which handles the userinfo, the
 * port and the database name. The password is percent-decoded, because it
 * may contain characters that are escaped in the URL.
 */
function parseDatabaseUrl(url) {
  const parsed = new URL(url);

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  if (!database) {
    fail(`The connection string has no database name: ${url}`);
  }

  const [user, password] = (
    parsed.username ? `${parsed.username}:${parsed.password}` : ''
  )
    .split(':')
    .map((part) => decodeURIComponent(part));

  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: user || 'postgres',
    password: password ?? '',
    database,
  };
}

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
