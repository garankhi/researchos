import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type {
  OpenAlexAuthor,
  OpenAlexWork,
  OpenAlexWorksPage,
} from './openalex.types.js';

/**
 * Default OpenAlex API root.
 *
 * Overridable with `OPENALEX_API_URL` for tests and mirrors; the contact
 * address (`OPENALEX_MAILTO`) is always configuration, never a constant.
 */
export const DEFAULT_OPENALEX_API_URL = 'https://api.openalex.org';

/**
 * Maps an OpenAlex work `type` onto the platform `output_type` vocabulary.
 *
 * `output_revisions.output_type` is a free `varchar(50)` defaulting to
 * `PAPER`; OpenAlex uses lowercase kinds (`article`, `book`, `preprint`,
 * `dataset`, …). Unknown types fall back to `PAPER`, which is also the
 * database default.
 */
export const OPENALEX_TYPE_MAP: Record<string, string> = {
  article: 'PAPER',
  preprint: 'PREPRINT',
  review: 'REVIEW',
  editorial: 'EDITORIAL',
  'book-chapter': 'BOOK_CHAPTER',
  book: 'BOOK',
  dataset: 'DATASET',
  dissertation: 'DISSERTATION',
};

/** Maximum works per page OpenAlex allows. */
const MAX_PER_PAGE = 200;

const FETCH_ATTEMPTS = 3;
const FETCH_RETRY_BASE_MS = 1000;
const FETCH_TIMEOUT_MS = 10_000;

/** Upstream statuses worth retrying: rate limit or a busy gateway. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rebuilds the abstract text from an OpenAlex inverted index.
 *
 * OpenAlex returns `abstract_inverted_index` as a map of word to the
 * positions it occupies (`{ "Hello": [0], "world": [1] }`). The client
 * rebuilds the original text from it. A work with no index has no
 * abstract — that is null, not an empty string.
 */
export function reconstructAbstract(
  index: Record<string, number[]> | null | undefined,
): string | null {
  if (!index || typeof index !== 'object') {
    return null;
  }

  const entries = Object.entries(index);
  if (entries.length === 0) {
    return null;
  }

  let size = 0;
  const positions: Array<[number, string]> = [];
  for (const [word, slots] of entries) {
    if (!Array.isArray(slots)) {
      continue;
    }
    for (const slot of slots) {
      if (!Number.isInteger(slot) || slot < 0) {
        continue;
      }
      positions.push([slot, word]);
      if (slot + 1 > size) {
        size = slot + 1;
      }
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const words: string[] = Array.from({ length: size }, () => '');
  for (const [slot, word] of positions) {
    // A position claimed twice keeps the first word; a corrupt index must
    // not duplicate tokens into the text.
    if (words[slot] === '') {
      words[slot] = word;
    }
  }

  const text = words.filter((word) => word !== '').join(' ');
  return text === '' ? null : text;
}

/**
 * Normalises a DOI at the client boundary.
 *
 * OpenAlex returns the DOI as a URL (`https://doi.org/10.xxxx/...`); the
 * ingest stores the bare form (`10.xxxx/...`). The database trigger
 * `normalize_output_doi` normalises again, so this is a best-effort mirror
 * of it: strip the URL/`doi:` prefix, trim, lowercase. Empty means none.
 */
export function normalizeDoi(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  let doi = value.trim();
  doi = doi.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '').trim();
  doi = doi.toLowerCase();
  return doi === '' ? null : doi;
}

/** Short OpenAlex id (`W2741809807`) from a canonical URL or bare id. */
function shortId(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const trimmed = value.trim();
  const bare = trimmed.startsWith('http')
    ? (trimmed.split('/').pop() ?? '')
    : trimmed;
  return bare === '' ? null : bare;
}

/** Maps a raw OpenAlex `type` onto the platform vocabulary. */
export function mapOutputType(rawType: unknown): string {
  if (typeof rawType !== 'string') {
    return 'PAPER';
  }
  return OPENALEX_TYPE_MAP[rawType] ?? 'PAPER';
}

/** Display names of the institutions OpenAlex last saw the author at. */
export function extractAffiliations(raw: RawAuthor): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const name = value.trim();
      if (!out.includes(name)) {
        out.push(name);
      }
    }
  };
  const institutions = raw.last_known_institutions;
  if (Array.isArray(institutions)) {
    for (const entry of institutions) {
      push((entry as { display_name?: unknown })?.display_name);
    }
  }
  const affiliations = raw.affiliations;
  if (Array.isArray(affiliations)) {
    for (const entry of affiliations) {
      const record = entry as {
        institution?: { display_name?: unknown };
        display_name?: unknown;
      };
      push(record?.institution?.display_name ?? record?.display_name);
    }
  }
  return out;
}

type RawAuthorship = {
  author?: { id?: unknown; display_name?: unknown; orcid?: unknown };
  raw_author_name?: unknown;
  is_corresponding?: unknown;
};

type RawWork = {
  id?: unknown;
  doi?: unknown;
  title?: unknown;
  display_name?: unknown;
  abstract_inverted_index?: unknown;
  primary_location?: { source?: { display_name?: unknown } };
  publication_year?: unknown;
  type?: unknown;
  authorships?: unknown;
  [key: string]: unknown;
};

type RawAuthor = {
  id?: unknown;
  display_name?: unknown;
  orcid?: unknown;
  works_count?: unknown;
  last_known_institutions?: unknown;
  affiliations?: unknown;
};

/**
 * The OpenAlex client every pull path goes through.
 *
 * Client only: it fetches and shapes the data. It does not write the work
 * (RES-137) and does not write provenance rows (RES-14 decides the class
 * each field gets). The lookup that uses it is RES-134.
 */
@Injectable()
export class OpenAlexClient {
  private readonly logger = new Logger(OpenAlexClient.name);
  private readonly baseUrl: string;
  private readonly mailto: string;

  constructor(private readonly config: ConfigService) {
    const base =
      this.config.get<string>('OPENALEX_API_URL') ?? DEFAULT_OPENALEX_API_URL;
    this.baseUrl = base.replace(/\/+$/, '');
    // The polite pool: a contact in the user agent keeps daily traffic
    // from being rate-limited. Configured, never hard-coded.
    this.mailto =
      this.config.get<string>('OPENALEX_MAILTO') ?? 'dev@researchos.local';
  }

  private userAgent(): string {
    return `ResearchOS/1.0 (mailto:${this.mailto})`;
  }

  /**
   * Resolves an OpenAlex author by ORCID.
   *
   * `GET /authors?filter=orcid:<orcid>`. Throws `openalex_author_not_found`
   * (404) when OpenAlex knows no such author.
   */
  async getAuthorByOrcid(orcid: string): Promise<OpenAlexAuthor> {
    const cleaned = orcid.trim();
    if (cleaned === '') {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const url = new URL(`${this.baseUrl}/authors`);
    url.searchParams.set('filter', `orcid:${cleaned}`);
    const body = await this.getJson<{ results?: RawAuthor[] }>(url);
    const raw = body.results?.[0];
    if (!raw) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toAuthor(raw);
  }

  /**
   * Searches OpenAlex authors by name.
   *
   * `GET /authors?search:<name>`. The fallback when the researcher has no
   * ORCID (RES-134): the result is only a candidate list, never
   * authoritative — the researcher still ticks what is theirs.
   */
  async searchAuthors(
    query: string,
    options: { perPage?: number } = {},
  ): Promise<OpenAlexAuthor[]> {
    const cleaned = query.trim();
    if (cleaned === '') {
      return [];
    }
    const perPage = Math.min(Math.max(options.perPage ?? 10, 1), MAX_PER_PAGE);
    const url = new URL(`${this.baseUrl}/authors`);
    url.searchParams.set('search', cleaned);
    url.searchParams.set('per-page', String(perPage));
    const body = await this.getJson<{ results?: RawAuthor[] }>(url);
    return (body.results ?? []).map((raw) => this.toAuthor(raw));
  }

  /**
   * Lists works for an OpenAlex author.
   *
   * `GET /works?filter=author.id:<author_id>`, paged. The lookup pages
   * through the works; the read endpoint (RES-138) reads the database.
   */
  async getWorksByAuthor(
    authorId: string,
    options: { page?: number; perPage?: number } = {},
  ): Promise<OpenAlexWorksPage> {
    const short = shortId(authorId);
    if (!short) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const page =
      Number.isInteger(options.page) && (options.page as number) >= 1
        ? (options.page as number)
        : 1;
    const perPage = Math.min(Math.max(options.perPage ?? 25, 1), MAX_PER_PAGE);
    if (!Number.isInteger(perPage) || perPage < 1) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const url = new URL(`${this.baseUrl}/works`);
    url.searchParams.set('filter', `author.id:${short}`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per-page', String(perPage));
    const body = await this.getJson<{
      meta?: { count?: number };
      results?: RawWork[];
    }>(url);
    const works = (body.results ?? []).map((raw) => this.toWork(raw));
    const total =
      typeof body.meta?.count === 'number' ? body.meta.count : works.length;
    return { total, works };
  }

  /**
   * Fetches one work with full metadata.
   *
   * `GET /works/<work_id>` — venue, year, abstract, authors, DOI.
   */
  async getWork(workId: string): Promise<OpenAlexWork> {
    const short = shortId(workId);
    if (!short) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.workNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const url = new URL(`${this.baseUrl}/works/${encodeURIComponent(short)}`);
    const body = await this.getJson<RawWork>(url);
    if (!body || typeof body.id !== 'string') {
      throw new CodedHttpException(
        domainErrorCodes.openalex.workNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toWork(body);
  }

  private toAuthor(raw: RawAuthor): OpenAlexAuthor {
    const id = typeof raw.id === 'string' ? raw.id : '';
    const displayName =
      typeof raw.display_name === 'string' ? raw.display_name : '';
    return {
      id,
      shortId: shortId(id) ?? id,
      displayName,
      orcid: typeof raw.orcid === 'string' ? raw.orcid : null,
      worksCount: typeof raw.works_count === 'number' ? raw.works_count : null,
      affiliations: extractAffiliations(raw),
    };
  }

  private toWork(raw: RawWork): OpenAlexWork {
    const id = typeof raw.id === 'string' ? raw.id : '';
    const title = (
      typeof raw.title === 'string' && raw.title.trim() !== ''
        ? raw.title
        : typeof raw.display_name === 'string'
          ? raw.display_name
          : ''
    ).trim();
    const venue =
      typeof raw.primary_location?.source?.display_name === 'string'
        ? raw.primary_location.source.display_name
        : null;
    const publicationYear =
      typeof raw.publication_year === 'number' ? raw.publication_year : null;
    const rawType = typeof raw.type === 'string' ? raw.type : null;
    const authorships = Array.isArray(raw.authorships) ? raw.authorships : [];
    const authors = (authorships as RawAuthorship[]).map((entry, index) => {
      const fallback =
        typeof entry.author?.display_name === 'string'
          ? entry.author.display_name
          : '';
      const name =
        typeof entry.raw_author_name === 'string' &&
        entry.raw_author_name.trim() !== ''
          ? entry.raw_author_name.trim()
          : fallback.trim();
      const authorId =
        typeof entry.author?.id === 'string' ? entry.author.id : null;
      return {
        order: index + 1,
        name,
        isCorresponding: entry.is_corresponding === true,
        authorId,
        orcid:
          typeof entry.author?.orcid === 'string' ? entry.author.orcid : null,
      };
    });

    return {
      id,
      shortId: shortId(id) ?? id,
      doi: normalizeDoi(raw.doi),
      title,
      abstract: reconstructAbstract(
        raw.abstract_inverted_index as Record<string, number[]> | null,
      ),
      venue,
      publicationYear,
      rawType,
      outputType: mapOutputType(rawType),
      url: null,
      authors,
    };
  }

  /**
   * GETs JSON with retries and typed failures.
   *
   * Failures surface as domain codes the caller maps to a 4xx or a job
   * failure — never as a bare 500:
   * - 404 on a single-resource path → the matching `*_not_found` (404)
   * - anything else, including network errors → `openalex_unavailable` (503)
   */
  private async getJson<T>(url: URL): Promise<T> {
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': this.userAgent(),
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        this.logger.warn(
          `OpenAlex request failed (attempt ${attempt}/${FETCH_ATTEMPTS}): ${url.pathname}${url.search} — ${(error as Error).message}`,
        );
        if (attempt < FETCH_ATTEMPTS) {
          await sleep(FETCH_RETRY_BASE_MS * attempt);
          continue;
        }
        throw new CodedHttpException(
          domainErrorCodes.openalex.serviceUnavailable,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          throw new CodedHttpException(
            domainErrorCodes.openalex.serviceUnavailable,
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
      }

      lastStatus = response.status;

      if (response.status === 404) {
        const path = url.pathname;
        if (path.includes('/authors')) {
          throw new CodedHttpException(
            domainErrorCodes.openalex.authorNotFound,
            HttpStatus.NOT_FOUND,
          );
        }
        throw new CodedHttpException(
          domainErrorCodes.openalex.workNotFound,
          HttpStatus.NOT_FOUND,
        );
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < FETCH_ATTEMPTS) {
        await sleep(FETCH_RETRY_BASE_MS * attempt);
        continue;
      }

      this.logger.warn(
        `OpenAlex request failed: ${response.status} ${url.pathname}${url.search}`,
      );
      throw new CodedHttpException(
        domainErrorCodes.openalex.serviceUnavailable,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.warn(
      `OpenAlex request failed after ${FETCH_ATTEMPTS} attempts (last status ${lastStatus}): ${url.pathname}${url.search}`,
    );
    throw new CodedHttpException(
      domainErrorCodes.openalex.serviceUnavailable,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
