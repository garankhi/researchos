#!/usr/bin/env node
/**
 * Shared helpers for the SQL-first database tooling.
 *
 * The workspace does not use Prisma Migrate. `ResearchOS.sql` owns the schema
 * and `packages/database/prisma/schema.prisma` is a derived artifact that is
 * regenerated from the live database by `scripts/introspect-schema.mjs`.
 *
 * These helpers exist so that the reset, the schema generation and the drift
 * check all talk to the database in exactly the same way. A drift check that
 * uses a different code path than the generator would be worthless.
 */
import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the `packages/database` directory. */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path of the workspace root. */
export const workspaceRoot = resolve(packageRoot, '..', '..');

/** Absolute path of `ResearchOS.sql`, the source of truth for the schema. */
export const sqlFile = resolve(workspaceRoot, 'ResearchOS.sql');

/** Absolute path of the generated Prisma datamodel. */
export const schemaFile = resolve(packageRoot, 'prisma', 'schema.prisma');

/**
 * The seed schema used as the target of `prisma db pull`.
 *
 * `prisma db pull` refuses to run against a file that does not exist and
 * requires a datasource block, so a minimal valid schema is written first.
 * The `output` path points at the real generated client directory so that the
 * client is produced from the real schema afterwards.
 */
const seedSchema = `generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
`;

/**
 * Loads the environment the same way the Prisma CLI does.
 *
 * The package local `.env` overrides the workspace root `.env`, and a real
 * environment variable always wins over both. This mirrors
 * `packages/database/prisma.config.ts` so that the CLI and these scripts
 * resolve `DATABASE_URL` to the same database.
 */
export function loadEnvironment() {
  const paths = [
    resolve(packageRoot, '.env.local'),
    resolve(packageRoot, '.env'),
    resolve(workspaceRoot, '.env'),
  ];

  for (const path of paths) {
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;

      const key = match[1];
      if (process.env[key] !== undefined) continue;

      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

/**
 * Returns the connection string of the database, without the database name.
 *
 * The database name is needed separately because connecting to a database that
 * does not exist yet fails, and the tooling has to be able to create it.
 */
export function databaseUrl() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill in the values.',
    );
  }

  return url;
}

/** Returns the database name from the connection string. */
export function databaseName(url = databaseUrl()) {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, '');

  if (!name) {
    throw new Error(`DATABASE_URL does not name a database: ${url}`);
  }

  return name;
}

/**
 * Returns a connection string pointing at a different database on the same
 * server.
 */
export function urlForDatabase(name, url = databaseUrl()) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/**
 * Runs a command and returns its stdout, throwing on a non-zero exit code.
 *
 * When an `input` is given, stdin is a pipe so that the text reaches the
 * command. Without that, `stdio` would be `['ignore', ...]` and the input
 * would be silently dropped.
 */
export function run(command, args, options = {}) {
  const { input, ...rest } = options;

  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    ...rest,
    ...(input === undefined ? {} : { input }),
  });
}

/** Runs a Prisma CLI command inside `packages/database`. */
export function prisma(args, options = {}) {
  return run(process.execPath, [require_prisma_bin(), ...args], {
    cwd: packageRoot,
    ...options,
  });
}

let prismaBin;

/** Resolves the path of the Prisma CLI entry point. */
function require_prisma_bin() {
  if (prismaBin) return prismaBin;

  const candidates = [
    resolve(packageRoot, 'node_modules', 'prisma', 'build', 'index.js'),
    resolve(workspaceRoot, 'node_modules', 'prisma', 'build', 'index.js'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      prismaBin = candidate;
      return prismaBin;
    }
  }

  throw new Error(
    'Could not locate the Prisma CLI. Run `pnpm install` at the workspace root.',
  );
}

/** Writes a file without a byte order mark. */
export function writeFileUtf8(path, contents) {
  writeFileSync(path, contents, 'utf8');
}

/** Waits until a TCP port accepts connections, or the timeout expires. */
export async function waitForPort(port, host = '127.0.0.1', timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const reachable = await new Promise((resolvePromise) => {
      const socket = createConnection({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolvePromise(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolvePromise(false);
      });
    });

    if (reachable) return true;
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Nothing is listening on ${host}:${port} after ${timeoutMs}ms.`);
}

/**
 * Runs a SQL script against a database using the `psql` binary that ships
 * with the Docker image, so that the script is applied by exactly the same
 * tool every time.
 */
export function applySql(name, sqlPath = sqlFile) {
  const contents = readFileSync(sqlPath, 'utf8');

  return run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'postgres',
      '-d',
      name,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '/dev/stdin',
    ],
    {
      cwd: workspaceRoot,
      input: contents,
    },
  );
}

/** Creates the seed schema file used as the `db pull` target. */
export function writeSeedSchema(path) {
  writeFileUtf8(path, seedSchema);
}

/**
 * Runs a SQL statement against a database through the container's `psql`.
 *
 * The statements are passed on stdin so that no quoting or escaping issue
 * can change their meaning.
 */
export function runSql(name, sql) {
  return run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'postgres',
      '-d',
      name,
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
      '-f',
      '/dev/stdin',
    ],
    {
      cwd: workspaceRoot,
      input: sql,
    },
  );
}

/** Creates a database if it does not exist yet. */
export function createDatabase(name) {
  runSql('postgres', `CREATE DATABASE "${name}";`);
}

/** Drops a database if it exists. */
export function dropDatabase(name) {
  runSql('postgres', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`);
}

/**
 * Returns true when the database exists on the server.
 */
export function databaseExists(name) {
  const result = run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
    ],
    { cwd: workspaceRoot },
  );

  return result.trim() === '1';
}
