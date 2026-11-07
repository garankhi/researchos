// Seeds the taxonomy from the OpenAlex API, and the development accounts and
// the demo records for local login.
//
// Run with: pnpm db:seed:online
//
// This seed needs network access and no API key is required, but OpenAlex
// limits the shared daily budget of an unauthenticated request, so the
// fetch takes about ninety seconds. The onboarding uses the snapshot
// instead, which is `pnpm db:seed`.
//
// The taxonomy is seeded once, not synced. A topic proposed by a user is the
// only one that goes through a review queue; the imported ones need no
// approval.
//
// The taxonomy is imported with the compiled Prisma client rather than with
// raw SQL, so the column and relation names are checked at compile time.
// Prisma 7 emits its client as TypeScript into `src/generated/prisma`, and
// this script runs on plain Node, so the compiled copy in `dist/` is the one
// that is importable. `db:seed:online` therefore builds the package first.
//
// Every write is an upsert on `(source, external_id)`, which is the identity
// the schema defines for imported nodes. The seed is idempotent: running it
// twice leaves the same rows, with the same internal ids.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { redactDatabaseUrl, resolveDatabaseUrl } from './database-url.mjs';
import {
  TAXONOMY_LEVELS,
  fail,
  fetchAll,
  log,
  normalizeChild,
  normalizeRecord,
} from './openalex.mjs';
import {
  reportCounts,
  seedDemoRecords,
  seedTaxonomy,
} from './seed.mjs';

/**
 * Fetches one taxonomy level and returns the normalised records.
 */
async function fetchLevel(level) {
  const records = [];

  await fetchAll(level.resource, async (page) => {
    for (const node of page) {
      records.push(
        level.parent === null
          ? normalizeRecord(node)
          : normalizeChild(node, level.parent),
      );
    }
  });

  return records;
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();

  log('ResearchOS taxonomy seed (from the OpenAlex API)');
  log(`  database ${redactDatabaseUrl(databaseUrl)}`);
  log('');

  log('Fetching the taxonomy from OpenAlex ...');

  const levels = [];

  for (const level of TAXONOMY_LEVELS) {
    const records = await fetchLevel(level);

    log(`  ${level.resource.padEnd(10)} ${records.length} record(s)`);

    levels.push(records);
  }

  log('');

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const idsByTopicExternalId = await seedTaxonomy(prisma, {
      fields: levels[0],
      subfields: levels[1],
      topics: levels[2],
    });

    await seedDemoRecords(prisma, idsByTopicExternalId);

    await reportCounts(prisma);
  } finally {
    await prisma.$disconnect();
  }
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
