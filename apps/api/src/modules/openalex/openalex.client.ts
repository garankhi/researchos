import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutputType } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { normalizeDoi } from '@researchos/publication-metadata';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type {
  OpenAlexAffiliation,
  OpenAlexAuthor,
  OpenAlexAuthorCounts,
  OpenAlexAuthorRecord,
  OpenAlexAuthorTopic,
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

const OPENALEX_TYPE_MAP = new Map<string, OutputType>([
  ['article', OutputType.ARTICLE],
  ['preprint', OutputType.PREPRINT],
  ['review', OutputType.REVIEW],
  ['editorial', OutputType.EDITORIAL],
  ['book-chapter', OutputType.BOOK_CHAPTER],
  ['book', OutputType.BOOK],
  ['dataset', OutputType.DATASET],
  ['dissertation', OutputType.DISSERTATION],
]);

/** Maximum works per page OpenAlex allows. */
const MAX_PER_PAGE = 200;

/**
 * The one institution every researcher in scope belongs to.
 *
 * Hard-coded on purpose: every researcher in scope is at FPT University,
 * so the affiliation is never read from the profile. The OpenAlex
 * institution id is what the works filter uses — it matches the
 * institution OpenAlex normalised every FPT affiliation to, including the
 * bylines whose raw string was messy (`"FPT University, Can Tho, Viet
 * Nam"` vs `"FPT University, Can Tho City, Vietnam"`). The name stays as
 * the text the raw affiliation strings are matched against, because the
 * raw strings are the only affiliation a work carries per authorship.
 */
export const FPT_UNIVERSITY = {
  /** The display name as FPT University writes it. */
  name: 'FPT University',
  /** The OpenAlex institution id — `https://openalex.org/I109689652`. */
  openAlexId: 'I109689652',
  /** The ROR id of the same institution. */
  ror: 'https://ror.org/03esj4g97',
} as const;

/**
 * The affiliation filter for the name-based works search.
 *
 * OpenAlex author ids are not always present (unlinked authorships, name
 * fallback path), so the works fetch falls back to matching the byline
 * name plus this affiliation.
 */
export const FPT_UNIVERSITY_AFFILIATION = FPT_UNIVERSITY.name;

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
export function mapOutputType(rawType: unknown): OutputType {
  const mapped =
    typeof rawType === 'string' ? OPENALEX_TYPE_MAP.get(rawType) : undefined;
  return mapped ?? OutputType.ARTICLE;
}

/** Normalises paging options shared by the works list methods. */
function normalizePaging(options: { page?: number; perPage?: number }): {
  page: number;
  perPage: number;
} {
  const page =
    Number.isInteger(options.page) && (options.page as number) >= 1
      ? (options.page as number)
      : 1;
  const perPage = Math.min(Math.max(options.perPage ?? 25, 1), MAX_PER_PAGE);
  return { page, perPage };
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

/**
 * The affiliation strings of one authorship.
 *
 * Two sources, both needed. `raw_affiliation_strings` is the affiliation
 * exactly as the publisher wrote it (`"FPT University, Can Tho, Viet
 * Nam"`), and `institutions` is the institution OpenAlex resolved it to.
 * The raw string is what a name match is checked against, because the
 * resolved institution is absent from an unlinked authorship.
 */
function extractAuthorshipAffiliations(raw: RawAuthorship): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const name = value.trim();
      if (!out.includes(name)) {
        out.push(name);
      }
    }
  };
  if (Array.isArray(raw.raw_affiliation_strings)) {
    for (const entry of raw.raw_affiliation_strings) {
      push(entry);
    }
  }
  if (Array.isArray(raw.institutions)) {
    for (const entry of raw.institutions) {
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
  raw_affiliation_strings?: unknown;
  institutions?: unknown;
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
  cited_by_count?: unknown;
  last_known_institutions?: unknown;
  affiliations?: unknown;
  summary_stats?: unknown;
  display_name_alternatives?: unknown;
  raw_author_names?: unknown;
  observed_orcids?: unknown;
  topics?: unknown;
  [key: string]: unknown;
};

type RawInstitution = {
  id?: unknown;
  ror?: unknown;
  display_name?: unknown;
  country_code?: unknown;
  type?: unknown;
};

type RawAffiliation = {
  institution?: RawInstitution;
  years?: unknown;
};

/** The counts OpenAlex reports for an author. */
function toAuthorCounts(raw: RawAuthor): OpenAlexAuthorCounts {
  const stats =
    typeof raw.summary_stats === 'object' && raw.summary_stats !== null
      ? (raw.summary_stats as Record<string, unknown>)
      : {};
  return {
    worksCount: numberOrNull(raw.works_count),
    citedByCount: numberOrNull(raw.cited_by_count),
    hIndex: numberOrNull(stats.h_index),
    i10Index: numberOrNull(stats.i10_index),
    twoYearMeanCitedness: numberOrNull(stats['2yr_mean_citedness']),
  };
}

/**
 * The affiliations of an author, with the years they held.
 *
 * The year range is the whole point of the record: it is what tells a
 * year at FPT University apart from a year at another institution.
 *
 * OpenAlex reports the years as a list — `[2023]` — and the list is
 * sparse: an author who was at an institution for three years has three
 * entries, and the gaps in between are not spelled out. The range is
 * therefore the first and the last year, not the count.
 */
function toAffiliations(raw: RawAuthor): OpenAlexAffiliation[] {
  const entries = Array.isArray(raw.affiliations)
    ? (raw.affiliations as RawAffiliation[])
    : [];
  const out: OpenAlexAffiliation[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const institution = entry.institution;
    if (!institution || typeof institution.id !== 'string') {
      continue;
    }
    const id = institution.id.replace(/^https?:\/\/openalex\.org\//, '');
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const years = Array.isArray(entry.years)
      ? entry.years.filter((year): year is number => typeof year === 'number')
      : [];

    out.push({
      institutionId: id,
      ror: typeof institution.ror === 'string' ? institution.ror : null,
      name:
        typeof institution.display_name === 'string'
          ? institution.display_name
          : id,
      countryCode:
        typeof institution.country_code === 'string'
          ? institution.country_code
          : null,
      institutionType:
        typeof institution.type === 'string' ? institution.type : null,
      yearStart: years.length > 0 ? Math.min(...years) : null,
      yearEnd: years.length > 0 ? Math.max(...years) : null,
    });
  }

  return out;
}

/**
 * The byline spellings OpenAlex has observed for an author.
 *
 * OpenAlex reports them twice — as `display_name_alternatives` and as
 * `raw_author_names` — and the two lists are the same. They are read
 * from both so a payload that carries only one still yields the corpus.
 *
 * The canonical display name is always part of the set: it is a spelling
 * the author published under too.
 */
function toAuthorNames(raw: RawAuthor): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (trimmed === '' || out.includes(trimmed)) {
      return;
    }
    out.push(trimmed);
  };

  push(raw.display_name);
  for (const list of [raw.display_name_alternatives, raw.raw_author_names]) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const value of list) {
      push(value);
    }
  }

  return out;
}

/** The topics OpenAlex assigned to an author. */
function toAuthorTopics(raw: RawAuthor): OpenAlexAuthorTopic[] {
  const entries = Array.isArray(raw.topics)
    ? (raw.topics as Record<string, unknown>[])
    : [];
  const out: OpenAlexAuthorTopic[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string') {
      continue;
    }
    const id = entry.id.replace(/^https?:\/\/openalex\.org\//, '');
    const hierarchy = (key: string): string | null => {
      const value = entry[key];
      if (!value || typeof value !== 'object') {
        return null;
      }
      const nodeId = (value as { id?: unknown }).id;
      return typeof nodeId === 'string'
        ? nodeId.replace(/^https?:\/\/openalex\.org\//, '')
        : null;
    };

    out.push({
      id,
      name: typeof entry.display_name === 'string' ? entry.display_name : id,
      count: numberOrNull(entry.count),
      subfieldId: hierarchy('subfield'),
      fieldId: hierarchy('field'),
      domainId: hierarchy('domain'),
    });
  }

  return out;
}

/** A number, or null when the value is not one. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The full OpenAlex record of an author. */
export function toAuthorRecord(raw: RawAuthor): OpenAlexAuthorRecord {
  const id = typeof raw.id === 'string' ? raw.id : '';
  const observed = Array.isArray(raw.observed_orcids)
    ? (raw.observed_orcids as unknown[])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value !== '')
    : [];

  return {
    id,
    shortId: shortId(id) ?? id,
    displayName:
      typeof raw.display_name === 'string' ? raw.display_name : '',
    orcid: typeof raw.orcid === 'string' ? raw.orcid : null,
    observedOrcids: observed,
    names: toAuthorNames(raw),
    affiliations: toAffiliations(raw),
    counts: toAuthorCounts(raw),
    topics: toAuthorTopics(raw),
    raw: raw as Record<string, unknown>,
  };
}

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
  private readonly apiKey: string | null;

  constructor(private readonly config: ConfigService) {
    const base =
      this.config.get<string>('OPENALEX_API_URL') ?? DEFAULT_OPENALEX_API_URL;
    this.baseUrl = base.replace(/\/+$/, '');
    // The polite pool: a contact in the user agent keeps daily traffic
    // from being rate-limited. Configured, never hard-coded.
    this.mailto =
      this.config.get<string>('OPENALEX_MAILTO') ?? 'dev@researchos.local';
    // The API key lifts the client out of the anonymous pool. The
    // anonymous pool shares one daily budget across everyone on the
    // network's IP address, so it runs out for the whole office at once;
    // a key gives the workspace its own budget. Optional — the client
    // works without one, just more fragile.
    const key = this.config.get<string>('OPENALEX_API_KEY')?.trim();
    this.apiKey = key && key !== '' ? key : null;
  }

  private userAgent(): string {
    return `ResearchOS/1.0 (mailto:${this.mailto})`;
  }

  /**
   * Adds the API key to a request, when there is one.
   *
   * The key travels as the `api_key` query parameter, which is how
   * OpenAlex authenticates a server-to-server call.
   */
  private withApiKey(url: URL): URL {
    if (this.apiKey !== null) {
      url.searchParams.set('api_key', this.apiKey);
    }
    return url;
  }

  /**
   * Resolves an OpenAlex author by ORCID.
   *
   * `GET /authors?filter=orcid:<orcid>`. Throws `openalex_author_not_found`
   * (404) when OpenAlex knows no such author.
   *
   * The ORCID is **not** unique in OpenAlex. The same ORCID is often
   * claimed by a merged author profile — the one that swallowed the
   * works of several people over the years — so the filter alone
   * resolves to the wrong author very easily. The affiliation filter is
   * what makes the answer trustworthy: only an author OpenAlex has
   * recorded at FPT University qualifies.
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
    url.searchParams.set(
      'filter',
      `orcid:${cleaned},affiliations.institution.id:${FPT_UNIVERSITY.openAlexId}`,
    );
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
   * Resolves an OpenAlex author by its id.
   *
   * `GET /authors/<author_id>`. The strongest identifier OpenAlex has:
   * the researcher confirmed this author during onboarding, so every
   * later pull resolves through it. Throws `openalex_author_not_found`
   * (404) when OpenAlex knows no such author.
   */
  async getAuthorById(authorId: string): Promise<OpenAlexAuthor> {
    const short = shortId(authorId);
    if (!short) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const url = new URL(`${this.baseUrl}/authors/${encodeURIComponent(short)}`);
    const body = await this.getJson<RawAuthor>(url);
    if (!body || typeof body.id !== 'string') {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toAuthor(body);
  }

  /**
   * Fetches the full OpenAlex record of one author.
   *
   * `GET /authors/<author_id>` — the same endpoint as `getAuthorById`,
   * but the whole record is kept instead of the few fields the lookup
   * needs.
   *
   * The full record is fetched once, at onboarding, and stored. Later
   * syncs do not need it: OpenAlex bills by request, and the counts move
   * slowly enough that a periodic refresh of the cheap yearly view
   * covers them.
   */
  async getAuthorRecord(authorId: string): Promise<OpenAlexAuthorRecord> {
    const short = shortId(authorId);
    if (!short) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const url = new URL(`${this.baseUrl}/authors/${encodeURIComponent(short)}`);
    const body = await this.getJson<RawAuthor>(url);
    if (!body || typeof body.id !== 'string') {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    return toAuthorRecord(body);
  }

  /**
   * Searches OpenAlex authors by name.
   *
   * `GET /authors?search:<name>`. The fallback when the researcher has no
   * confirmed identifier (RES-134): the result is only a candidate list,
   * never authoritative — the researcher still ticks what is theirs.
   *
   * The search is scoped to FPT University, because every researcher in
   * scope is there. Without the scope the search for a Vietnamese name
   * returns thousands of authors worldwide, none of whom is the
   * researcher — the affiliation filter is what makes the candidate list
   * meaningful.
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
    url.searchParams.set(
      'filter',
      `affiliations.institution.id:${FPT_UNIVERSITY.openAlexId}`,
    );
    url.searchParams.set('per-page', String(perPage));
    const body = await this.getJson<{ results?: RawAuthor[] }>(url);
    return (body.results ?? []).map((raw) => this.toAuthor(raw));
  }

  /**
   * Lists works for an OpenAlex author.
   *
   * `GET /works?filter=author.id:<author_id>`, paged. The lookup pages
   * through the works; the read endpoint (RES-138) reads the database.
   *
   * The fetch is scoped to FPT University. An OpenAlex author profile
   * accumulates the works of every byline that was ever merged into it,
   * so the author's own works are only a subset of what the id returns.
   * The affiliation scope is what keeps the pull from claiming another
   * researcher's work — the researcher is at FPT University, and only
   * their FPT works are theirs.
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
    const { page, perPage } = normalizePaging(options);
    const url = new URL(`${this.baseUrl}/works`);
    url.searchParams.set(
      'filter',
      `author.id:${short},authorships.institutions.id:${FPT_UNIVERSITY.openAlexId}`,
    );
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
   * Lists works by author byline name plus affiliation.
   *
   * `GET /works?filter=raw_author_name.search:<name>,authorships.institutions.id:<institution id>`,
   * paged. The fallback when no OpenAlex author id is present: an author
   * id is not always available (unlinked authorships, name-only path), so
   * the lookup matches the name as published plus the affiliation.
   *
   * Two details of the filter matter:
   *
   * - The name is **not** quoted. `raw_author_name.search` is already a
   *   phrase search over a single authorship field, and quoting narrows it
   *   to an exact string that most bylines never match — `"Thi Thuy An
   *   Ngo"` returns 53 works while the unquoted form returns 227, and a
   *   name with no FPT works returns 0 quoted against 3257 unquoted.
   *   Quoting therefore loses works, it never filters noise.
   * - The affiliation uses the **institution id**, not the raw string.
   *   `authorships.institutions.id` matches the institution OpenAlex
   *   normalised the affiliation to, so a byline written
   *   `"FPT University, Can Tho, Viet Nam"` matches the same as
   *   `"FPT University, Can Tho City, Vietnam"`.
   *
   * The filter pairs at the *work* level, not the authorship level: a work
   * whose named byline is at another institution still passes when a
   * co-author is at FPT University. `filterWorksByAuthorship` narrows that
   * down to the works where the named byline itself is at FPT University.
   */
  async searchWorksByAuthorName(
    authorName: string,
    options: { affiliation?: string; page?: number; perPage?: number } = {},
  ): Promise<OpenAlexWorksPage> {
    const cleaned = authorName.trim().replace(/"/g, ' ').trim();
    if (cleaned === '') {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const affiliation = (options.affiliation ?? FPT_UNIVERSITY_AFFILIATION)
      .trim()
      .replace(/"/g, ' ')
      .trim();
    const { page, perPage } = normalizePaging(options);
    const url = new URL(`${this.baseUrl}/works`);
    const filter =
      affiliation === ''
        ? `raw_author_name.search:${cleaned}`
        : `raw_author_name.search:${cleaned},authorships.institutions.id:${FPT_UNIVERSITY.openAlexId}`;
    url.searchParams.set('filter', filter);
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
        affiliations: extractAuthorshipAffiliations(entry),
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
    // The key goes on every request. `getJson` is the single way out to
    // OpenAlex, so one call covers the whole client.
    const requestUrl = this.withApiKey(url);

    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(requestUrl, {
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
