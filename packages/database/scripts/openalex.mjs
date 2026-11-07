// The OpenAlex taxonomy, as a reusable module.
//
// Two consumers use this: the online seed, which fetches the taxonomy from
// the OpenAlex API, and the export script, which writes the fetched
// taxonomy to a snapshot file. Keeping the fetching and the normalisation
// in one place means the snapshot and the online seed can never disagree
// about what a record looks like.

/**
 * The OpenAlex API root.
 */
export const OPENALEX_API = 'https://api.openalex.org';

/**
 * The three taxonomy levels, in the order they have to be imported.
 *
 * OpenAlex paginates with a page number, so every level is fetched in pages
 * until the last one is reached. The order matters for the import: a
 * subfield needs its field and a topic needs its subfield to exist first.
 */
export const TAXONOMY_LEVELS = [
  { resource: 'fields', model: 'research_fields', parent: null },
  { resource: 'subfields', model: 'research_subfields', parent: 'field' },
  { resource: 'topics', model: 'research_topics', parent: 'subfield' },
];

/**
 * The number of records requested per page. The API allows 200 per page.
 */
export const PAGE_SIZE = 200;

/**
 * Reports a failure and ends the run.
 *
 * The `name` is set explicitly, so that the callers can recognise the error
 * and print the message on its own, instead of a stack trace. A subclass of
 * `Error` inherits the name `Error` otherwise.
 */
export class SeedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SeedError';
  }
}

/**
 * Throws a `SeedError` with the given message.
 */
export function fail(message) {
  throw new SeedError(message);
}

/**
 * Writes a line to stdout.
 */
export function log(message) {
  process.stdout.write(`${message}\n`);
}

/**
 * The number of attempts for a request that fails with a transient error.
 */
const FETCH_ATTEMPTS = 4;

/**
 * The base delay between the attempts, in milliseconds. The delay grows
 * with every attempt, because a gateway that just timed out needs time to
 * recover.
 */
const FETCH_RETRY_BASE_MS = 2000;

/**
 * The status codes that are worth retrying.
 *
 * A rate limit and a gateway timeout both mean the same thing here: the
 * request was fine, the server was busy. A 404 is a wrong URL and a 400 is
 * a wrong parameter, so neither is retried.
 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Waits for the given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches one page of an OpenAlex resource.
 *
 * The response is the plain JSON envelope OpenAlex returns for the list
 * endpoints: `meta.count` is the total number of records, `meta.page` is the
 * page that was returned, and `results` holds the page itself.
 *
 * A transient failure is retried, because the OpenAlex API is shared and
 * occasionally answers with a gateway timeout.
 */
async function fetchPage(resource, page) {
  const url = new URL(`${OPENALEX_API}/${resource}`);
  url.searchParams.set('per-page', String(PAGE_SIZE));
  url.searchParams.set('page', String(page));

  let lastError;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ResearchOS taxonomy (mailto:dev@researchos.local)',
        },
      });

      if (response.ok) {
        return response.json();
      }

      if (!RETRYABLE_STATUS.has(response.status)) {
        fail(
          `OpenAlex request failed: ${response.status} ${response.statusText}\n` +
            `  ${url.toString()}`,
        );
      }

      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error.message;
    }

    if (attempt < FETCH_ATTEMPTS) {
      const delay = FETCH_RETRY_BASE_MS * attempt;

      log(
        `  ${resource} page ${page}: ${lastError}, retrying in ${delay / 1000}s ` +
          `(attempt ${attempt}/${FETCH_ATTEMPTS})`,
      );

      await sleep(delay);
    }
  }

  fail(
    `OpenAlex request failed after ${FETCH_ATTEMPTS} attempts: ${lastError}\n` +
      `  ${url.toString()}`,
  );
}

/**
 * Fetches every record of an OpenAlex resource.
 *
 * The topics level has several thousand records, so the pages are streamed
 * and the caller decides what to do with each one. This keeps the whole
 * result set out of memory.
 */
export async function fetchAll(resource, onPage) {
  let page = 0;
  let total = null;
  let seen = 0;

  for (;;) {
    page += 1;

    const body = await fetchPage(resource, page);
    const results = body.results ?? [];

    if (total === null) {
      total = body.meta?.count ?? 0;
    }

    seen += results.length;
    await onPage(results);

    if (results.length < PAGE_SIZE) {
      break;
    }
  }

  return { total: total ?? 0, pages: page, records: seen };
}

/**
 * The OpenAlex canonical id, stored as the `external_id`.
 *
 * The full canonical URL is used rather than the shortened id, so that the
 * same object always has the same external id no matter which endpoint it
 * was reached through.
 */
export function externalId(node) {
  const id = node.ids?.openalex ?? node.id;

  if (typeof id !== 'string' || id.length === 0) {
    fail(`An OpenAlex record has no id: ${JSON.stringify(node).slice(0, 200)}`);
  }

  return id;
}

/**
 * The source timestamp of an OpenAlex record.
 *
 * `updated_date` is the moment the source last changed the record.
 * `source_updated_at` stays NULL when the source does not provide a
 * trustworthy timestamp, which is why it is only set from `updated_date`.
 */
export function sourceUpdatedAt(node) {
  const value = node.updated_date;

  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The OpenAlex id of a parent record, for example the field of a subfield.
 *
 * The parent link arrives as a canonical URL, so it can be used as it is.
 */
export function parentExternalId(node, key) {
  const parent = node[key];
  const id = parent?.ids?.openalex ?? parent?.id;

  if (typeof id !== 'string' || id.length === 0) {
    fail(
      `An OpenAlex record has no ${key}: ${JSON.stringify(node).slice(0, 200)}`,
    );
  }

  return id.startsWith('http') ? id : `https://openalex.org${id}`;
}

/**
 * Normalises an OpenAlex record into the row the taxonomy tables hold.
 *
 * The snapshot stores exactly these fields, so the online seed and the
 * local seed write the same columns from the same values.
 */
export function normalizeRecord(node) {
  return {
    external_id: externalId(node),
    name: node.display_name,
    description: node.description ?? null,
    source_updated_at: sourceUpdatedAt(node)?.toISOString() ?? null,
  };
}

/**
 * Normalises an OpenAlex record together with its parent link.
 */
export function normalizeChild(node, parentKey) {
  return {
    ...normalizeRecord(node),
    parent_external_id: parentExternalId(node, parentKey),
  };
}
