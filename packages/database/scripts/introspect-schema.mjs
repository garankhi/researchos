#!/usr/bin/env node
/**
 * Regenerates `prisma/schema.prisma` from the live database.
 *
 * The database schema is owned by `ResearchOS.sql`. This script introspects
 * the live database with `prisma db pull` and rewrites the result into the
 * conventions of this repository:
 *
 * - PascalCase model and enum names, camelCase field names, with `@map` and
 *   `@@map` pointing at the snake_case names that live in SQL.
 * - `previewFeatures = ["partialIndexes"]`, so that the partial unique
 *   indexes that Prisma can represent survive the round trip.
 *
 * The transformation is deterministic and driven by the database itself. That
 * matters: `scripts/drift-check.mjs` runs the very same code against a
 * scratch database built from `ResearchOS.sql` and compares the result with
 * the committed file. If the transform were not deterministic, the check
 * would report drift for no reason.
 *
 * Usage:
 *   pnpm --filter @researchos/database db:schema
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  databaseName,
  loadEnvironment,
  packageRoot,
  prisma,
  schemaFile,
  urlForDatabase,
  writeFileUtf8,
  writeSeedSchema,
} from './lib.mjs';
import { transformSchema } from './transform.mjs';

loadEnvironment();

const rawSchemaPath = resolve(packageRoot, 'prisma', '.introspected.prisma');

/**
 * Introspects a database and returns the transformed schema.
 *
 * @param {string} database The database to introspect.
 * @returns {string} The transformed Prisma schema.
 */
export function introspect(database = databaseName()) {
  writeSeedSchema(rawSchemaPath);

  try {
    prisma([
      'db',
      'pull',
      '--schema',
      rawSchemaPath,
      '--url',
      urlForDatabase(database),
    ]);

    const introspected = readFileSync(rawSchemaPath, 'utf8');
    return transformSchema(introspected);
  } finally {
    if (existsSync(rawSchemaPath)) {
      rmSync(rawSchemaPath, { force: true });
    }
  }
}

/**
 * Writes the transformed schema to `prisma/schema.prisma` and generates the
 * client from it.
 */
export function writeSchema(contents) {
  writeFileUtf8(schemaFile, contents);
}

/** Entry point used by `pnpm db:schema`. */
function main() {
  const database = databaseName();

  console.log(`Introspecting the database "${database}" ...`);

  const generated = introspect(database);

  writeSchema(generated);
  console.log(`Wrote ${schemaFile}`);

  console.log('Running prisma format ...');
  prisma(['format', '--schema', schemaFile]);

  console.log('Running prisma generate ...');
  prisma(['generate', '--schema', schemaFile]);

  console.log('Done.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
