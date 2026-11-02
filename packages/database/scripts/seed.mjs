// Seeds the taxonomy from the snapshot file that is committed to the
// repository, and the development accounts for local login.
//
// Run with: pnpm db:seed
//
// This is the seed the onboarding uses. It needs no network and no API key,
// and it takes about a second instead of the ninety seconds the online seed
// needs. The snapshot is refreshed by hand with `pnpm db:taxonomy:export`.
//
// The taxonomy is seeded once, not synced. A topic proposed by a user is the
// only one that goes through a review queue; the imported ones need no
// approval.
//
// The taxonomy is imported with the compiled Prisma client rather than with
// raw SQL, so the column and relation names are checked at compile time.
// Prisma 7 emits its client as TypeScript into `src/generated/prisma`, and
// this script runs on plain Node, so the compiled copy in `dist/` is the one
// that is importable. `db:seed` therefore builds the package first.
//
// Every write is an upsert on `(source, external_id)`, which is the identity
// the schema defines for imported nodes. The seed is idempotent: running it
// twice leaves the same rows, with the same internal ids.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { redactDatabaseUrl, resolveDatabaseUrl } from './database-url.mjs';
import { seedDevUsers } from './dev-users.mjs';
import { fail, log } from './openalex.mjs';
import { seedTaxonomy } from './seed-taxonomy.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The snapshot file. It lives next to the scripts that read it, because it
 * belongs to the seed rather than to the schema.
 */
const SNAPSHOT_PATH = resolve(packageRoot, 'scripts', 'data', 'openalex-taxonomy.json');

/**
 * The schema version of the snapshot file that this script understands.
 */
const SNAPSHOT_VERSION = 1;

/**
 * Reads the snapshot and checks that it can be read by this script.
 */
function readSnapshot() {
  let raw;

  try {
    raw = readFileSync(SNAPSHOT_PATH, 'utf8');
  } catch {
    fail(
      `The taxonomy snapshot is missing: ${SNAPSHOT_PATH}\n` +
        'Regenerate it with:\n' +
        '\n  pnpm db:taxonomy:export\n',
    );
  }

  let snapshot;

  try {
    snapshot = JSON.parse(raw);
  } catch (error) {
    fail(`The taxonomy snapshot is not valid JSON: ${error.message}`);
  }

  if (snapshot?.version !== SNAPSHOT_VERSION) {
    fail(
      `The taxonomy snapshot has version ${snapshot?.version}, but this script reads ` +
        `version ${SNAPSHOT_VERSION}.\n` +
        'Regenerate it with:\n' +
        '\n  pnpm db:taxonomy:export\n',
    );
  }

  for (const key of ['research_fields', 'research_subfields', 'research_topics']) {
    if (!Array.isArray(snapshot[key])) {
      fail(`The taxonomy snapshot has no ${key} list.`);
    }
  }

  return snapshot;
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();

  log('ResearchOS taxonomy seed (from the local snapshot)');
  log(`  database ${redactDatabaseUrl(databaseUrl)}`);
  log(`  snapshot ${SNAPSHOT_PATH}`);
  log('');

  const snapshot = readSnapshot();

  log('Snapshot contents:');
  log(`  research_fields    ${snapshot.research_fields.length}`);
  log(`  research_subfields ${snapshot.research_subfields.length}`);
  log(`  research_topics    ${snapshot.research_topics.length}`);
  log('');

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedTaxonomy(prisma, {
      fields: snapshot.research_fields,
      subfields: snapshot.research_subfields,
      topics: snapshot.research_topics,
    });

    const [fields, subfields, topics] = await Promise.all([
      prisma.research_fields.count(),
      prisma.research_subfields.count(),
      prisma.research_topics.count(),
    ]);

    log('');
    log('Seed complete.');
    log(`  research_fields    ${fields}`);
    log(`  research_subfields ${subfields}`);
    log(`  research_topics    ${topics}`);

    await seedDevUsers(prisma);
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
