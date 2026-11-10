/**
 * Shared shapes for the OpenAlex API client.
 *
 * These are the *shaped* values the pull pipeline consumes, not the raw
 * OpenAlex payloads. The raw payloads are wide and versioned by OpenAlex;
 * the client normalises the fields RES-16 needs and drops the rest, so a
 * change in an unused OpenAlex field cannot ripple into the ingest.
 */

/** An OpenAlex author, as the lookup needs it. */
export interface OpenAlexAuthor {
  /** Canonical id, e.g. `https://openalex.org/A5023888391`. */
  id: string;
  /** Short id, e.g. `A5023888391`. */
  shortId: string;
  /** Display name from OpenAlex. */
  displayName: string;
  /** ORCID URL when OpenAlex knows it, otherwise null. */
  orcid: string | null;
  /** Total works OpenAlex reports, when present. */
  worksCount: number | null;
}

/** One author of a work, in platform order. */
export interface OpenAlexWorkAuthor {
  /** 1-based position in the `authorships` array. */
  order: number;
  /** Author name; `raw_author_name` first, author display name as fallback. */
  name: string;
  /** Whether OpenAlex marks this author as corresponding. */
  isCorresponding: boolean;
  /** Canonical OpenAlex author id when present. */
  authorId: string | null;
  /** ORCID URL when OpenAlex knows it. */
  orcid: string | null;
}

/**
 * An OpenAlex work, shaped for the ingest.
 *
 * `id` is the stable identity — it is what later lands in
 * `output_external_ids.external_id` with `source = 'OPENALEX'`.
 */
export interface OpenAlexWork {
  /** Canonical id, e.g. `https://openalex.org/W2741809807`. */
  id: string;
  /** Short id, e.g. `W2741809807`. */
  shortId: string;
  /** Normalised DOI (`10.xxxx/...`) or null when the work has none. */
  doi: string | null;
  /** Work title, trimmed; empty string when OpenAlex has none. */
  title: string;
  /** Reconstructed abstract, or null when there is no inverted index. */
  abstract: string | null;
  /** Venue from `primary_location.source.display_name`, or null. */
  venue: string | null;
  /** Publication year, or null. */
  publicationYear: number | null;
  /** Raw OpenAlex `type`, e.g. `article`. */
  rawType: string | null;
  /**
   * Platform `output_type` vocabulary. Defaults to `PAPER`; see
   * `OPENALEX_TYPE_MAP` for the mapping.
   */
  outputType: string;
  /** Landing page URL when OpenAlex provides one. */
  url: string | null;
  /** Authors in array order. */
  authors: OpenAlexWorkAuthor[];
}

/** One page of works for an author. */
export interface OpenAlexWorksPage {
  /** Total works OpenAlex reports for the filter. */
  total: number;
  /** Shaped works on this page. */
  works: OpenAlexWork[];
}
