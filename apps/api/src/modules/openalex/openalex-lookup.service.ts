import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { FPT_UNIVERSITY, OpenAlexClient } from './openalex.client.js';
import {
  affiliationMatchesFpt,
  filterWorksByAuthorship,
  filterWorksByIdentity,
  shortAuthorId,
  type ResearcherIdentity,
} from './openalex.identity.js';
import { OpenAlexWorksCache } from './openalex-works-cache.js';
import type {
  OpenAlexAuthor,
  OpenAlexAuthorRecentWork,
  OpenAlexWork,
  OpenAlexWorksPage,
} from './openalex.types.js';

/**
 * One candidate work with its preview metadata.
 *
 * This is the input to the ingest (RES-137): the OpenAlex work id becomes
 * `output_external_ids.external_id` with `source = 'OPENALEX'`.
 * `confirmed` is true only when the work was resolved through an
 * identifier — a name-only search is never authoritative (Vietnamese
 * names collide), so every candidate from that path stays unconfirmed
 * until the researcher ticks what is theirs.
 */
export interface CandidateWorkPreview {
  /** Canonical OpenAlex id, e.g. `https://openalex.org/W2741809807`. */
  workId: string;
  /** Short id, e.g. `W2741809807`. */
  shortId: string;
  /** Work title, trimmed; empty when OpenAlex has none. */
  title: string;
  /** Normalised DOI or null when the work has none. */
  doi: string | null;
  /** Publication year, or null. */
  publicationYear: number | null;
  /** Platform `output_type` vocabulary. */
  outputType: string;
  /** Venue or null. */
  venue: string | null;
  /** True only when resolved through a confirmed identifier. */
  confirmed: boolean;
}

/**
 * One author candidate from the name fallback.
 *
 * Returned when the researcher has no confirmed identifier: an OpenAlex
 * author search by name. The researcher still ticks what is theirs — this
 * list never feeds the ingest directly.
 */
export interface CandidateAuthorPreview {
  author: OpenAlexAuthor;
  /** Whether the author's affiliation is FPT University. */
  affiliationMatch: boolean;
  /** The author's most recent works, newest first. */
  recentWorks: OpenAlexAuthorRecentWork[];
}

/**
 * How the candidate list was produced.
 *
 * `AUTHOR_ID` and `ORCID` are the confirmed identifiers; `NAME` is the
 * fallback for a researcher with no OpenAlex and no ORCID profile.
 */
export type LookupMode = 'AUTHOR_ID' | 'ORCID' | 'NAME';

/**
 * The lookup half of the pull (RES-134).
 *
 * Resolves the researcher in OpenAlex and lists their works. It does not
 * write anything — the work upsert is RES-137 and the claim write is
 * RES-155. The client calls are RES-136; this is the lookup logic.
 */
@Injectable()
export class OpenAlexLookupService {
  private readonly logger = new Logger(OpenAlexLookupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: OpenAlexClient,
    private readonly cache: OpenAlexWorksCache,
  ) {}

  /**
   * Finds candidate works for a researcher.
   *
   * The chain, strongest identifier first:
   *
   * 1. **The confirmed OpenAlex author id.** One author lookup plus paged
   *    works calls. This is the path every later pull takes, once the
   *    researcher has confirmed their author during onboarding.
   * 2. **The ORCID.** The same shape, resolved through the ORCID.
   * 3. **The name.** Author candidates by name, all unconfirmed, with no
   *    works attached. The researcher picks their author first; works come
   *    after.
   *
   * A work with no DOI is kept — that is not a duplicate signal. The same
   * work under two ids (preprint + published) is caught by the DOI.
   */
  async findCandidates(userId: string): Promise<
    | {
        mode: 'AUTHOR_ID' | 'ORCID';
        author: OpenAlexAuthor;
        works: CandidateWorkPreview[];
      }
    | { mode: 'NAME'; authors: CandidateAuthorPreview[] }
  > {
    const identity = await this.resolveIdentity(userId);

    if (identity.openAlexAuthorId) {
      const author = await this.client.getAuthorById(identity.openAlexAuthorId);
      const works = await this.listAllWorks(
        author.shortId || author.id,
        identity,
      );
      return {
        mode: 'AUTHOR_ID',
        author,
        works: works.map((work) => toPreview(work, true)),
      };
    }

    const orcid = identity.orcid?.trim();
    if (orcid) {
      // The ORCID tier is a *best effort*: OpenAlex knows only the
      // ORCIDs that were claimed there, and a researcher may hold an
      // ORCID that was never linked to an OpenAlex profile. A miss is
      // not a failure — it falls through to the name tier, which is the
      // permanent fallback.
      const author = await this.findAuthorByOrcid(orcid);
      if (author) {
        const works = await this.listAllWorks(
          author.shortId || author.id,
          identity,
        );
        return {
          mode: 'ORCID',
          author,
          works: works.map((work) => toPreview(work, true)),
        };
      }
    }

    const fullName = identity.name.trim();
    if (fullName === '') {
      return { mode: 'NAME', authors: [] };
    }
    const authors = await this.client.searchAuthors(fullName, {
      perPage: 10,
    });
    return {
      mode: 'NAME',
      authors: await this.withRecentWorks(
        authors.map((author) => ({
          author,
          affiliationMatch: matchesAffiliation(author),
          recentWorks: [],
        })),
      ),
    };
  }

  /**
   * Attaches the recent works to a list of candidates.
   *
   * ## Why the works come with the list
   *
   * The name alone cannot identify a researcher: a Vietnamese name is
   * shared by many people, and OpenAlex merges profiles that carry the
   * same byline. The works are the part the researcher recognises — "I
   * wrote that paper" — so they are fetched once, with the list, and
   * not when the researcher clicks a candidate.
   *
   * ## Why one call covers the whole list
   *
   * The listing is filtered over every candidate id at once. A request
   * per candidate would cost one round trip per row and the researcher
   * cannot tell which row they are looking at until the request comes
   * back.
   *
   * A failure is not fatal: the candidates are still worth showing
   * without their works, and the researcher can still confirm one.
   */
  private async withRecentWorks(
    candidates: CandidateAuthorPreview[],
  ): Promise<CandidateAuthorPreview[]> {
    if (candidates.length === 0) {
      return candidates;
    }
    try {
      const buckets = await this.client.getRecentWorksByAuthors(
        candidates.map((entry) => entry.author.shortId || entry.author.id),
      );
      return candidates.map((entry) => ({
        ...entry,
        recentWorks: buckets.get(entry.author.shortId) ?? [],
      }));
    } catch (error) {
      this.logger.warn(
        `Could not fetch the recent works of the author candidates: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return candidates.map((entry) => ({ ...entry, recentWorks: [] }));
    }
  }

  /**
   * Lists works for a picked author id (name-fallback second step).
   *
   * The researcher ticks their author from the candidate list; this pages
   * that author's works. Every preview stays unconfirmed — a name-only
   * search is never authoritative.
   *
   * Fallback when the id is missing: an OpenAlex author id is not always
   * present (unlinked authorships, name-only path), so a caller may pass
   * the researcher's byline name instead. The fetch then matches the
   * byline name plus the FPT University affiliation, and narrows the
   * result to the works whose *named* byline is at FPT University — the
   * filter itself pairs at the work level, so a work whose named byline
   * is elsewhere still passes it when a co-author is at FPT.
   *
   * A blank id with a blank name raises `openalex_author_not_found` (404).
   */
  async findWorksForAuthor(
    authorId: string,
    options: {
      authorName?: string;
      affiliation?: string;
      identity?: ResearcherIdentity;
    } = {},
  ): Promise<CandidateWorkPreview[]> {
    const works = await this.listAllWorksWithFallback(
      authorId,
      options.authorName,
      options.affiliation,
      options.identity,
    );
    return works.map((work) => toPreview(work, false));
  }

  /**
   * The full works of an author, for the ingest.
   *
   * The same fetch as `findWorksForAuthor`, but the shaped works rather
   * than their previews: the ingest needs the byline, the abstract and
   * the per-authorship affiliation, none of which a preview carries.
   */
  async listWorksForAuthor(
    authorId: string,
    options: {
      authorName?: string;
      affiliation?: string;
      identity?: ResearcherIdentity;
    } = {},
  ): Promise<OpenAlexWork[]> {
    return this.listAllWorksWithFallback(
      authorId,
      options.authorName,
      options.affiliation,
      options.identity,
    );
  }

  /**
   * The full works of a byline name, for the ingest.
   *
   * The same fetch as `findWorksByAuthorName`, but the shaped works.
   */
  async listWorksByAuthorName(
    authorName: string,
    affiliation: string = FPT_UNIVERSITY.name,
  ): Promise<OpenAlexWork[]> {
    return this.listAllWorksByName(authorName, affiliation);
  }

  /**
   * The full works of an author, served from the cache when possible.
   *
   * ## Why the cache sits here and not in the pull
   *
   * The wizard shows the works OpenAlex holds for the researcher, and
   * the finalize call pulls the ones they decided on. Both need the same
   * paged listing, and the listing is the expensive part — it walks
   * every page of the author's bibliography. Caching it here means the
   * two calls share one fetch.
   *
   * ## What is cached
   *
   * The **raw** paged listing, before the identity filter. The filter
   * narrows the list to the works the researcher themselves are on, and
   * the filter's input — the identity — is not known at fetch time: the
   * researcher may confirm their ORCID in the profile step *after* the
   * preview was fetched. Caching the raw list and filtering afterwards
   * keeps both correct.
   *
   * The cache key is the author id, so a researcher who goes back to the
   * author step and picks somebody else gets a different entry, and one
   * who re-picks the same author hits the entry that is already there.
   */
  async listWorksForAuthorCached(
    authorId: string,
    options: { identity?: ResearcherIdentity } = {},
  ): Promise<OpenAlexWork[]> {
    const short = shortAuthorId(authorId);
    if (short === null) {
      return this.listAllWorksWithFallback(
        authorId,
        undefined,
        undefined,
        options.identity,
      );
    }

    const cached = await this.cache.get(short);
    const raw = cached ?? (await this.listAllWorks(short));
    if (cached === null) {
      await this.cache.set(short, raw);
    }

    if (!options.identity) {
      return raw;
    }
    return filterWorksByIdentity(raw, options.identity);
  }

  /**
   * Drops the cached work list of an author.
   *
   * Called once the wizard is done with it, so a later pull starts from
   * fresh works rather than the list the researcher saw days ago.
   */
  async dropCachedWorks(authorId: string): Promise<void> {
    const short = shortAuthorId(authorId);
    if (short === null) {
      return;
    }
    await this.cache.drop(short);
  }

  /**
   * Lists works by author byline name plus affiliation, without an id.
   *
   * Direct fallback entry point: same byline-name + affiliation match as
   * the `findWorksForAuthor` fallback, paged and de-duplicated, narrowed
   * to the works whose named byline is at FPT University. Every preview
   * stays unconfirmed.
   */
  async findWorksByAuthorName(
    authorName: string,
    affiliation: string = FPT_UNIVERSITY.name,
  ): Promise<CandidateWorkPreview[]> {
    const works = await this.listAllWorksByName(authorName, affiliation);
    return works.map((work) => toPreview(work, false));
  }

  /**
   * Reads the researcher's identity signals.
   *
   * The confirmed OpenAlex author id, the ORCID, and the account name.
   * The affiliation is not read — it is the hard-coded FPT University.
   *
   * The profile row is **optional**. A fresh researcher — one the seed
   * never provisioned — has no profile row at all, and that is exactly
   * the case the name fallback exists for. The account row carries the
   * name, so the fallback works without a profile row.
   */
  private async resolveIdentity(userId: string): Promise<ResearcherIdentity> {
    const profile = await this.prisma.researcher_profiles.findUnique({
      where: { user_id: userId },
      select: {
        orcid_id: true,
        openalex_author_id: true,
        users: { select: { full_name: true } },
      },
    });
    const account = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { full_name: true },
    });

    return {
      openAlexAuthorId: profile?.openalex_author_id ?? null,
      orcid: profile?.orcid_id ?? null,
      name: profile?.users.full_name ?? account?.full_name ?? '',
    };
  }

  /**
   * Resolves an OpenAlex author through an ORCID, if there is one.
   *
   * OpenAlex only knows the ORCIDs that were claimed there, so an ORCID
   * the researcher holds but never linked resolves to nothing. That is
   * not an error — it is the signal to fall through to the name tier.
   */
  private async findAuthorByOrcid(
    orcid: string,
  ): Promise<OpenAlexAuthor | null> {
    try {
      return await this.client.getAuthorByOrcid(orcid);
    } catch (error) {
      if (error instanceof CodedHttpException) {
        if (error.getStatus() === HttpStatus.NOT_FOUND) {
          return null;
        }
      }
      throw error;
    }
  }

  /**
   * Pages through every work page for an author, de-duplicated.
   *
   * Cheap by design: one works call per page, never one metadata call per
   * item. De-dupe is by work id first, then by DOI — a work with no DOI
   * is always kept.
   *
   * The fetch is scoped to FPT University, but the scope is at the
   * *work* level: a work passes it when a co-author is at FPT. The
   * post-filter narrows it back down to the works where the author
   * themselves are at FPT — the researcher is at FPT, so only their own
   * FPT works are theirs.
   */
  private async listAllWorks(
    authorId: string,
    identity?: ResearcherIdentity,
  ): Promise<OpenAlexWork[]> {
    const works = await this.collectAllPages((page, perPage) =>
      this.client.getWorksByAuthor(authorId, { page, perPage }),
    );
    if (!identity) {
      return works;
    }
    return filterWorksByIdentity(works, identity);
  }

  /**
   * Pages through works by id, falling back to name + affiliation.
   *
   * When `authorId` is blank the fetch uses `authorName` plus the
   * affiliation text instead. Both paths de-dupe the same way. A blank id
   * with a blank name raises through the client as
   * `openalex_author_not_found` (404).
   */
  private async listAllWorksWithFallback(
    authorId: string,
    authorName?: string,
    affiliation?: string,
    identity?: ResearcherIdentity,
  ): Promise<OpenAlexWork[]> {
    if (authorId.trim() !== '') {
      return this.listAllWorks(authorId, identity);
    }
    return this.listAllWorksByName(authorName ?? '', affiliation);
  }

  /** Pages through every work page for a byline name, de-duplicated. */
  private async listAllWorksByName(
    authorName: string,
    affiliation?: string,
  ): Promise<OpenAlexWork[]> {
    const works = await this.collectAllPages((page, perPage) =>
      this.client.searchWorksByAuthorName(authorName, {
        affiliation,
        page,
        perPage,
      }),
    );
    // The filter pairs the name and the affiliation at the work level, so
    // a work whose named byline is at another institution still passes
    // when a co-author is at FPT University. Narrow it back down to the
    // works where the named byline itself is at FPT University.
    return filterWorksByAuthorship(works, authorName);
  }

  /** Pages a works fetch to completion with id-then-DOI de-duplication. */
  private async collectAllPages(
    fetchPage: (page: number, perPage: number) => Promise<OpenAlexWorksPage>,
  ): Promise<OpenAlexWork[]> {
    const seenIds = new Set<string>();
    const seenDois = new Set<string>();
    const out: OpenAlexWork[] = [];

    let page = 1;
    const perPage = 100;
    for (;;) {
      const { total, works } = await fetchPage(page, perPage);

      for (const work of works) {
        const idKey = work.shortId || work.id;
        if (seenIds.has(idKey)) {
          continue;
        }
        if (work.doi && seenDois.has(work.doi)) {
          // Same work under two ids (preprint + published) — the DOI
          // catches it. Keep the first seen.
          continue;
        }
        seenIds.add(idKey);
        if (work.doi) {
          seenDois.add(work.doi);
        }
        out.push(work);
      }

      if (out.length >= total || works.length < perPage) {
        break;
      }
      page += 1;
    }

    return out;
  }
}

function toPreview(
  work: OpenAlexWork,
  confirmed: boolean,
): CandidateWorkPreview {
  return {
    workId: work.id,
    shortId: work.shortId,
    title: work.title,
    doi: work.doi,
    publicationYear: work.publicationYear,
    outputType: work.outputType,
    venue: work.venue,
    confirmed,
  };
}

/**
 * Whether an OpenAlex author is affiliated with FPT University.
 *
 * The affiliation is the hard-coded one, never the researcher's
 * department: every researcher in scope is at FPT University, and a
 * fresh account has no department to compare against.
 */
function matchesAffiliation(author: OpenAlexAuthor): boolean {
  return affiliationMatchesFpt(author.affiliations);
}
