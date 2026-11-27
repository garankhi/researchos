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
  /** Institution display names from the last known affiliations. */
  affiliations: string[];
  /**
   * The citation metrics OpenAlex reports for the author.
   *
   * They are the part of the record a researcher recognises fastest:
   * an h-index of 40 and an h-index of 2 are two different people
   * wearing the same name.
   */
  counts: OpenAlexAuthorCounts;
  /**
   * Every byline spelling OpenAlex has observed for the author.
   *
   * The byline is the other half of the recognition: a researcher who
   * published as `"Nguyen, Hoang Khoi Tran"` recognises that spelling
   * immediately, and it is also what tells two namesakes apart.
   */
  nameVariants: string[];
  /** Every ORCID seen across the author's workships. */
  observedOrcids: string[];
  /** The topics OpenAlex assigned to the author, most prolific first. */
  topics: OpenAlexAuthorTopic[];
  /** The affiliations, with the years they held. */
  affiliationHistory: OpenAlexAffiliation[];
}

/**
 * One of an author's recent works, as the recognition panel shows it.
 *
 * The panel needs three things and no more: what the work is called,
 * when it came out, and where it was published. The affiliation rides
 * along because a work the candidate published *elsewhere* is itself a
 * recognition cue.
 */
export interface OpenAlexAuthorRecentWork {
  /** Canonical id, e.g. `https://openalex.org/W2741809807`. */
  workId: string;
  /** Short id, e.g. `W2741809807`. */
  shortId: string;
  /** Work title, trimmed; empty string when OpenAlex has none. */
  title: string;
  /** Publication year, or null. */
  publicationYear: number | null;
  /** Venue from `primary_location.source.display_name`, or null. */
  venue: string | null;
  /**
   * The institution recorded on the candidate's *own* authorship.
   *
   * Null when OpenAlex recorded no institution for it — an unlinked
   * authorship — which is itself worth showing rather than hiding.
   */
  affiliation: string | null;
  /**
   * The short OpenAlex author ids of every authorship on the work.
   *
   * The bucketing key: one listing covers several authors, and the
   * authorship list says which of them the work belongs to.
   */
  authorIds: string[];
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
  /**
   * The affiliation strings OpenAlex recorded for *this* authorship.
   *
   * The affiliation filter is applied at the work level, not per
   * authorship, so a work whose named byline sits at another institution
   * still passes the filter when a co-author is at FPT University. The
   * strings below are the only way to tell the two apart, so the ingest
   * keeps them on the authorship.
   */
  affiliations: string[];
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
   * Platform `output_type` vocabulary. Defaults to `ARTICLE`; see
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

/**
 * An institution an author was affiliated with.
 *
 * The years matter as much as the institution: a year at FPT University
 * is the platform's business, a year at another institution is not.
 */
export interface OpenAlexAffiliation {
  /** The OpenAlex institution id, e.g. `I109689652`. */
  institutionId: string;
  /** The ROR id of the same institution, when OpenAlex knows one. */
  ror: string | null;
  /** The institution display name. */
  name: string;
  /** The ISO country code, e.g. `VN`. */
  countryCode: string | null;
  /**
   * The kind of institution: `education`, `company`, `healthcare`,
   * `nonprofit`, `government`, `facility`, `archive` or `other`.
   */
  institutionType: string | null;
  /** The first year the affiliation held. */
  yearStart: number | null;
  /** The last year the affiliation held. */
  yearEnd: number | null;
}

/**
 * The counts OpenAlex reports for an author.
 *
 * The two popularity measures answer different questions, and keeping
 * both is the point: the h-index is career-lifetime, so it favours a long
 * career over a hot recent topic, while the two-year mean is
 * recency-weighted, so it says how much the author is cited *now*.
 */
export interface OpenAlexAuthorCounts {
  /** Total works OpenAlex attributes to the author. */
  worksCount: number | null;
  /** Total citations to those works. */
  citedByCount: number | null;
  /** The h-index. */
  hIndex: number | null;
  /** The number of works with at least ten citations. */
  i10Index: number | null;
  /** The mean citations per work over the last two years. */
  twoYearMeanCitedness: number | null;
}

/**
 * One topic OpenAlex assigned to an author.
 *
 * `count` is the number of the author's works in the topic, which is the
 * useful number for a single author. OpenAlex's own `topic_share` is
 * deliberately not used: it divides by the works of the whole corpus, so
 * for one author it reads as a vanishing fraction and says nothing about
 * how much of *their* output the topic covers.
 */
export interface OpenAlexAuthorTopic {
  /** The OpenAlex topic id, e.g. `T11409`. */
  id: string;
  /** The topic display name. */
  name: string;
  /** How many of the author's works sit in the topic. */
  count: number | null;
  /** The subfield the topic belongs to. */
  subfieldId: string | null;
  /** The field the topic belongs to. */
  fieldId: string | null;
  /** The domain the topic belongs to. */
  domainId: string | null;
}

/**
 * The full OpenAlex record of one author.
 *
 * This is what the onboarding stores: the identity, the observed byline
 * spellings, the affiliations with their years, the counts and the
 * topics — plus the raw payload, so the parts the platform does not
 * model yet survive without a migration every time OpenAlex adds a
 * field.
 */
export interface OpenAlexAuthorRecord {
  /** The canonical id, e.g. `https://openalex.org/A5027558961`. */
  id: string;
  /** The short id, e.g. `A5027558961`. */
  shortId: string;
  /** The canonical display name. */
  displayName: string;
  /** The ORCID OpenAlex believes the author owns, in URL form. */
  orcid: string | null;
  /** Every ORCID seen across the author's workships. */
  observedOrcids: string[];
  /**
   * Every byline spelling OpenAlex has observed for the author.
   *
   * This is the corpus the name-based identity resolution matches
   * against. A researcher whose byline spelling differs from their
   * account name would otherwise match nothing at all.
   */
  names: string[];
  /** The affiliations, with the years they held. */
  affiliations: OpenAlexAffiliation[];
  /** The counts OpenAlex reports. */
  counts: OpenAlexAuthorCounts;
  /** The topics OpenAlex assigned. */
  topics: OpenAlexAuthorTopic[];
  /** The raw payload, kept whole. */
  raw: Record<string, unknown>;
}
