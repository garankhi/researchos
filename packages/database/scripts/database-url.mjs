// The connection string of the database the seeds write to.
//
// The rules match the ones the Prisma CLI uses, so that the seeds and the
// migrations always talk to the same database.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './openalex.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(packageRoot, '..', '..');

/**
 * Reads `DATABASE_URL` the way the Prisma CLI does: the package-local `.env`
 * overrides the workspace root `.env`, and a real environment variable is
 * used only when no file provides a value.
 *
 * The Prisma config loads those files with `override: true`, so an
 * environment variable set by the caller would normally lose against the
 * `.env` file. The seeds therefore read the files themselves, which also
 * keeps them usable in CI, where there is no `.env` file.
 */
export function resolveDatabaseUrl() {
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
    'DATABASE_URL is not set. The command needs a PostgreSQL connection string.\n' +
      'Set it in the root .env file or in the environment.',
  );
}

/**
 * Hides the password in a connection string, so that it can be printed.
 */
export function redactDatabaseUrl(url) {
  return url.replace(/\/\/[^@]*@/, '//***@');
}

/**
 * Parses a PostgreSQL connection string into its parts.
 *
 * The URL is parsed with the URL parser, which handles the userinfo, the
 * port and the database name. The password is percent-decoded, because it
 * may contain characters that are escaped in the URL.
 *
 * The query string is dropped. Prisma uses it for the schema name, which
 * the plain PostgreSQL driver does not know about.
 */
export function parseDatabaseUrl(url) {
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
