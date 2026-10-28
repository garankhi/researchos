// Regenerates apps/api/openapi.json from the Nest modules without
// starting a server. Run with: pnpm --filter api openapi
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { createOpenApiDocument } from '../dist/openapi.js';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', process.argv[2] ?? 'openapi.json');

const app = await NestFactory.create(AppModule, { logger: false });
const document = createOpenApiDocument(app);
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.log(`OpenAPI document written to ${outPath}`);
