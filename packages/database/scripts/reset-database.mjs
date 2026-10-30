#!/usr/bin/env node
/**
 * Rebuilds the database from `ResearchOS.sql`.
 *
 * The whole database is dropped and recreated, the SQL is applied, and the
 * Prisma datamodel is regenerated from the result. There is no incremental
 * step and no migration history, because `ResearchOS.sql` is the schema.
 *
 * Usage:
 *   pnpm --filter @researchos/database db:reset
 *
 * Options:
 *   --keep-data   Do not drop the database. Apply the SQL to the existing
 *                 one, which fails if the objects already exist.
 */
import { introspect, writeSchema } from './introspect-schema.mjs';
import {
  applySql,
  createDatabase,
  databaseExists,
  databaseName,
  dropDatabase,
  loadEnvironment,
  prisma,
  schemaFile,
  waitForPort,
} from './lib.mjs';

loadEnvironment();

/** Reads the port of the PostgreSQL server from the connection string. */
function databasePort() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }

  return Number(new URL(url).port || 5432);
}

/**
 * Entry point.
 */
async function main() {
  const keepData = process.argv.includes('--keep-data');
  const database = databaseName();

  console.log('Waiting for PostgreSQL on the configured port ...');
  await waitForPort(databasePort());

  if (keepData) {
    if (!databaseExists(database)) {
      throw new Error(`The database "${database}" does not exist.`);
    }

    console.log(`Applying ResearchOS.sql to the existing "${database}" ...`);
  } else {
    console.log(`Dropping the database "${database}" ...`);
    dropDatabase(database);

    console.log(`Creating the database "${database}" ...`);
    createDatabase(database);

    console.log('Applying ResearchOS.sql ...');
  }

  applySql(database);
  console.log('Applied ResearchOS.sql.');

  console.log('Regenerating the Prisma datamodel ...');
  const generated = introspect(database);
  writeSchema(generated);

  console.log('Running prisma format ...');
  prisma(['format', '--schema', schemaFile]);

  console.log('Running prisma generate ...');
  prisma(['generate', '--schema', schemaFile]);

  console.log('Done. The database is ready.');
}

await main();
