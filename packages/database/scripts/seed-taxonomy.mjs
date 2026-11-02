// Writes the taxonomy into the database, from records that are already in
// memory.
//
// Both seeds use this: the online one fetches the records from OpenAlex
// first, and the local one reads them from the snapshot file. Keeping the
// writes in one place means the two seeds can never drift apart.
//
// The writes are an upsert on `(source, external_id)`, which is the identity
// the schema defines for imported nodes. The seed is idempotent: running it
// twice leaves the same rows, with the same internal ids.

import { fail, log } from './openalex.mjs';

/**
 * The number of upserts that run at the same time.
 *
 * The upserts are independent of each other, so they are sent in batches
 * instead of one at a time. The number is kept modest so that the connection
 * pool is not overwhelmed.
 */
export const UPSERT_CONCURRENCY = 16;

/**
 * Runs the given tasks with a bounded number of them in flight at once.
 *
 * A task that rejects ends the run, but the tasks that are already in
 * flight are still awaited, so that no write is left half applied.
 */
export async function runBatched(tasks, limit) {
  const queue = [...tasks];

  const workers = Array.from(
    { length: Math.min(limit, queue.length) },
    async () => {
      for (;;) {
        const task = queue.shift();

        if (!task) {
          return;
        }

        await task();
      }
    },
  );

  await Promise.all(workers);
}

/**
 * The columns of a taxonomy row that the seed writes.
 */
function rowData(record, now) {
  return {
    name: record.name,
    description: record.description,
    source: 'OPENALEX',
    external_id: record.external_id,
    source_updated_at: record.source_updated_at
      ? new Date(record.source_updated_at)
      : null,
    last_synced_at: now,
    is_active: true,
  };
}

/**
 * Writes the fields into the database.
 *
 * The internal id of every written record is returned, keyed by its
 * external id, so that the levels below can resolve their parent link
 * without a second query per record.
 */
async function seedFields(prisma, records) {
  const idsByExternalId = new Map();
  const now = new Date();

  const tasks = records.map((record) => async () => {
    const data = rowData(record, now);

    const field = await prisma.research_fields.upsert({
      where: {
        source_external_id: { source: 'OPENALEX', external_id: record.external_id },
      },
      create: data,
      update: {
        name: data.name,
        description: data.description,
        source_updated_at: data.source_updated_at,
        last_synced_at: now,
      },
    });

    idsByExternalId.set(record.external_id, field.id);
  });

  await runBatched(tasks, UPSERT_CONCURRENCY);

  return idsByExternalId;
}

/**
 * Writes the subfields into the database.
 *
 * The parent field has to exist first, because the trigger
 * `normalize_taxonomy` rejects a child whose parent comes from a different
 * source, and the foreign key requires the parent row to exist.
 */
async function seedSubfields(prisma, records, idsByExternalId) {
  const now = new Date();

  const tasks = records.map((record) => async () => {
    const parentId = idsByExternalId.get(record.parent_external_id);

    if (!parentId) {
      fail(
        `The parent of ${record.external_id} (${record.parent_external_id}) was not seeded.\n` +
          'The taxonomy levels must be seeded in order.',
      );
    }

    const data = rowData(record, now);

    const subfield = await prisma.research_subfields.upsert({
      where: {
        source_external_id: { source: 'OPENALEX', external_id: record.external_id },
      },
      create: { ...data, field_id: parentId },
      update: {
        field_id: parentId,
        name: data.name,
        description: data.description,
        source_updated_at: data.source_updated_at,
        last_synced_at: now,
      },
    });

    idsByExternalId.set(record.external_id, subfield.id);
  });

  await runBatched(tasks, UPSERT_CONCURRENCY);
}

/**
 * Writes the topics into the database.
 */
async function seedTopics(prisma, records, idsByExternalId) {
  const now = new Date();

  const tasks = records.map((record) => async () => {
    const parentId = idsByExternalId.get(record.parent_external_id);

    if (!parentId) {
      fail(
        `The parent of ${record.external_id} (${record.parent_external_id}) was not seeded.\n` +
          'The taxonomy levels must be seeded in order.',
      );
    }

    const data = rowData(record, now);

    const topic = await prisma.research_topics.upsert({
      where: {
        source_external_id: { source: 'OPENALEX', external_id: record.external_id },
      },
      create: { ...data, subfield_id: parentId },
      update: {
        subfield_id: parentId,
        name: data.name,
        description: data.description,
        source_updated_at: data.source_updated_at,
        last_synced_at: now,
      },
    });

    idsByExternalId.set(record.external_id, topic.id);
  });

  await runBatched(tasks, UPSERT_CONCURRENCY);
}

/**
 * Writes the three taxonomy levels into the database.
 *
 * The levels are written in order, because a subfield needs its field and a
 * topic needs its subfield to exist first.
 */
export async function seedTaxonomy(prisma, { fields, subfields, topics }) {
  log('Seeding research_fields ...');
  const idsByExternalId = await seedFields(prisma, fields);

  log('Seeding research_subfields ...');
  await seedSubfields(prisma, subfields, idsByExternalId);

  log('Seeding research_topics ...');
  await seedTopics(prisma, topics, idsByExternalId);
}
