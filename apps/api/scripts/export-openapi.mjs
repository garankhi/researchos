// Regenerates apps/api/openapi.json from the Nest modules without
// starting a server. Run with: pnpm --filter api openapi
//
// Pass `--check` to verify the committed document is up to date without
// writing it: it exits non-zero when the file on disk differs from what the
// code generates. That keeps the committed spec honest.
import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { createOpenApiDocument } from '../dist/openapi.js';

// The Prisma client is constructed when the app module is instantiated, and
// it refuses to start without a connection string. The document export does
// not query the database, so a placeholder URL is enough to satisfy the
// constructor and keep this script independent of local credentials.
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/researchos?schema=public';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const positional = args.filter((arg) => !arg.startsWith('--'));
const outPath = resolve(here, '..', positional[0] ?? 'openapi.json');

const app = await NestFactory.create(AppModule, { logger: false });
const document = createOpenApiDocument(app);
await app.close();

const serialized = `${JSON.stringify(document, null, 2)}\n`;

if (checkOnly) {
  let current;

  try {
    current = readFileSync(outPath, 'utf8');
  } catch {
    console.error(`OpenAPI document is missing: ${outPath}`);
    process.exit(1);
  }

  if (current !== serialized) {
    console.error(
      'The committed OpenAPI document is out of date.\n' +
        'Run `pnpm --filter api openapi` and commit the result.',
    );
    process.exit(1);
  }

  console.log('OpenAPI document is up to date.');
} else {
  writeFileSync(outPath, serialized);
  console.log(`OpenAPI document written to ${outPath}`);
}
