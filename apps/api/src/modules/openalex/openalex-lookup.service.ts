import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { OpenAlexClient } from './openalex.client.js';
import type { OpenAlexAuthor, OpenAlexWork } from './openalex.types.js';

/**
 * One candidate work with its preview metadata.
 *
 * This is the input to the ingest (RES-137): the OpenAlex work id becomes
 * `output_external_ids.external_id` with `source = 'OPENALEX'`.
 * `confirmed` is true only for the ORCID path — a name-only search is
 * never authoritative (Vietnamese names collide), so every candidate from
 * that path stays unconfirmed until the researcher ticks what is theirs.
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
  /** True only when resolved through the researcher's ORCID. */
  confirmed: boolean;
}

/**
 * One author candidate from the name fallback.
 *
 * Returned when the researcher has no ORCID: an OpenAlex author search by
 * name plus affiliation. The researcher still ticks what is theirs — this
 * list never feeds the ingest directly.
 */
export interface CandidateAuthorPreview {
  author: OpenAlexAuthor;
  /** Whether an affiliation matches the researcher's department. */
  affiliationMatch: boolean;
}

/** How the candidate list was produced. */
export type LookupMode = 'ORCID' | 'NAME';

/**
 * The lookup half of the pull (RES-134).
 *
 * Resolves the researcher in OpenAlex and lists their works. It does not
 * write anything — the work upsert is RES-137 and the claim write is
 * RES-155. The client calls are RES-136; this is the lookup logic.
 */
@Injectable()
export class OpenAlexLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: OpenAlexClient,
  ) {}

  /**
   * Finds candidate works for a researcher.
   *
   * ORCID path when `researcher_profiles.orcid_id` is set: one author
   * lookup plus paged works calls, de-duplicated by work id and DOI.
   * A work with no DOI is kept — that is not a duplicate signal. The
   * same work under two ids (preprint + published) is caught by the DOI.
   *
   * Name fallback when there is no ORCID: author candidates by name plus
   * affiliation, all unconfirmed, with no works attached. The researcher
   * picks their author first; works come after.
   */
  async findCandidates(
    userId: string,
  ): Promise<
    | { mode: 'ORCID'; author: OpenAlexAuthor; works: CandidateWorkPreview[] }
    | { mode: 'NAME'; authors: CandidateAuthorPreview[] }
  > {
    const profile = await this.prisma.researcher_profiles.findUnique({
      where: { user_id: userId },
      include: { users: true },
    });

    if (!profile) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const orcid = profile.orcid_id?.trim();
    if (orcid) {
      const author = await this.client.getAuthorByOrcid(orcid);
      const works = await this.listAllWorks(author.shortId || author.id);
      return {
        mode: 'ORCID',
        author,
        works: works.map((work) => toPreview(work, true)),
      };
    }

    const fullName = profile.users.full_name?.trim() ?? '';
    if (fullName === '') {
      return { mode: 'NAME', authors: [] };
    }
    const authors = await this.client.searchAuthors(fullName, {
      perPage: 10,
    });
    const department = profile.users.department_unit?.trim() ?? '';
    return {
      mode: 'NAME',
      authors: authors.map((author) => ({
        author,
        affiliationMatch: matchesAffiliation(author, department),
      })),
    };
  }

  /**
   * Lists works for a picked author id (name-fallback second step).
   *
   * The researcher ticks their author from the candidate list; this pages
   * that author's works. Every preview stays unconfirmed — a name-only
   * search is never authoritative.
   */
  async findWorksForAuthor(authorId: string): Promise<CandidateWorkPreview[]> {
    const works = await this.listAllWorks(authorId);
    return works.map((work) => toPreview(work, false));
  }

  /**
   * Pages through every work page for an author, de-duplicated.
   *
   * Cheap by design: one works call per page, never one metadata call per
   * item. De-dupe is by work id first, then by DOI — a work with no DOI
   * is always kept.
   */
  private async listAllWorks(authorId: string): Promise<OpenAlexWork[]> {
    const seenIds = new Set<string>();
    const seenDois = new Set<string>();
    const out: OpenAlexWork[] = [];

    let page = 1;
    const perPage = 100;
    for (;;) {
      const { total, works } = await this.client.getWorksByAuthor(authorId, {
        page,
        perPage,
      });

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

/** Whether any OpenAlex affiliation mentions the researcher's department. */
function matchesAffiliation(
  author: OpenAlexAuthor,
  department: string,
): boolean {
  if (department === '' || author.affiliations.length === 0) {
    return false;
  }
  const needle = department.toLowerCase();
  return author.affiliations.some((affiliation) =>
    affiliation.toLowerCase().includes(needle),
  );
}
