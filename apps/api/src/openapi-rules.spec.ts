import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createOpenApiDocument } from './openapi.js';
import { checkOpenApiDocument } from './common/openapi/openapi-rules.js';

/**
 * The document is built in preview mode, which does not connect to the
 * database. The Prisma client still needs a connection string to be
 * constructed, so a placeholder is enough — nothing queries it.
 */
process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/researchos?schema=public';

async function buildDocument() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    preview: true,
  });

  try {
    return createOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

describe('OpenAPI document rules', () => {
  it('satisfies every rule', async () => {
    const document = await buildDocument();
    const violations = checkOpenApiDocument(document);

    // The message lists every violation at once, so a failing run tells the
    // author exactly which routes and fields need fixing.
    expect(violations.map((v) => `${v.rule} @ ${v.location}: ${v.message}`))
      .toEqual([]);
  });
});
