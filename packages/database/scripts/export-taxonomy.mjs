// Writes the OpenAlex taxonomy to a snapshot file, so that the setup of a
// new machine does not depend on the OpenAlex API.
//
// Run with: pnpm db:taxonomy:export
//
// The snapshot is committed to the repository. It is refreshed by hand when
// the taxonomy should be brought up to date, not by the seed. The seed only
// reads it.
//
// The file is written in a stable order, so that refreshing it produces a
// small diff instead of rewriting the whole file.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TAXONOMY_LEVELS,
  fail,
  fetchAll,
  log,
  normalizeChild,
  normalizeRecord,
} from './openalex.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The snapshot file. It lives next to the scripts that read it, because it
 * belongs to the seed rather than to the schema.
 */
const SNAPSHOT_PATH = resolve(packageRoot, 'scripts', 'data', 'openalex-taxonomy.json');

/**
 * The schema version of the snapshot file.
 *
 * The seed checks it, so a snapshot written by an older version of this
 * script is rejected instead of being read in a way that would seed the
 * wrong columns.
 */
const SNAPSHOT_VERSION = 1;

/**
 * Fetches one taxonomy level and returns the normalised records.
 *
 * The records are sorted by their external id, so the snapshot has a stable
 * order no matter what order the API returns the pages in.
 */
async function fetchLevel(level) {
  const records = [];

  const stats = await fetchAll(level.resource, async (page) => {
    for (const node of page) {
      records.push(
        level.parent === null
          ? normalizeRecord(node)
          : normalizeChild(node, level.parent),
      );
    }
  });

  records.sort((a, b) => a.external_id.localeCompare(b.external_id));

  log(`  ${level.resource.padEnd(10)} ${stats.records} record(s) in ${stats.pages} page(s)`);

  return records;
}

async function main() {
  log('Exporting the OpenAlex taxonomy ...');
  log('');

  const fields = await fetchLevel(TAXONOMY_LEVELS[0]);
  const subfields = await fetchLevel(TAXONOMY_LEVELS[1]);
  const topics = await fetchLevel(TAXONOMY_LEVELS[2]);

  const snapshot = {
    version: SNAPSHOT_VERSION,
    source: 'OPENALEX',
    counts: {
      research_fields: fields.length,
      research_subfields: subfields.length,
      research_topics: topics.length,
    },
    research_fields: fields,
    research_subfields: subfields,
    research_topics: topics,
  };

  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  log('');
  log('Export complete.');
  log(`  ${SNAPSHOT_PATH}`);
  log('');
  log('Commit the refreshed file together with the code that changed it.');
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
