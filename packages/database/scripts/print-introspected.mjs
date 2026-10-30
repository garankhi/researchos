#!/usr/bin/env node
/**
 * Prints the raw output of `prisma db pull` for a database.
 *
 * This is a development helper. It exists so that the transformation in
 * `transform.mjs` can be written against the real shape of the introspected
 * output instead of against an assumption about it.
 *
 * Usage:
 *   node scripts/print-introspected.mjs [databaseName] [outputFile]
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  databaseName,
  loadEnvironment,
  packageRoot,
  prisma,
  urlForDatabase,
  writeSeedSchema,
} from './lib.mjs';

loadEnvironment();

const rawSchemaPath = resolve(packageRoot, 'prisma', '.introspected.prisma');
const database = process.argv[2] ?? databaseName();
const outputFile = process.argv[3];

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

  const contents = readFileSync(rawSchemaPath, 'utf8');

  if (outputFile) {
    writeFileSync(resolve(packageRoot, outputFile), contents, 'utf8');
    console.error(`Wrote ${outputFile} (${contents.length} characters)`);
  } else {
    process.stdout.write(contents);
  }
} finally {
  rmSync(rawSchemaPath, { force: true });
}
