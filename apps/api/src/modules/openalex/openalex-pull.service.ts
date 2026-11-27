import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  OpenAlexAuthorCandidateDto,
  OpenAlexAuthorCandidatesDto,
} from './dto/openalex-author-response.dto.js';
import { OpenAlexWorkPreviewDto } from './dto/openalex-work-preview.dto.js';
import { PullOpenAlexWorksDto } from './dto/pull-openalex-works.dto.js';
import { PullOpenAlexWorksResultDto } from './dto/pull-openalex-works-result.dto.js';
import { OpenAlexIngestService } from './openalex-ingest.service.js';
import { OpenAlexLookupService } from './openalex-lookup.service.js';
import { shortAuthorId, type ResearcherIdentity } from './openalex.identity.js';
import type { OpenAlexAuthor, OpenAlexWork } from './openalex.types.js';

/**
 * The pull routes of the OpenAlex module.
 *
 * Three things happen here:
 *
 * 1. **discovery** — the author candidates, so the researcher can say
 *    which OpenAlex author is theirs;
 * 2. **preview** — the works OpenAlex holds, before anything is written;
 * 3. **pull** — the works written into the platform as candidates.
 *
 * The pull resolves the researcher through the confirmed chain — the
 * OpenAlex author id, then the ORCID, then the name plus the hard-coded
 * FPT University affiliation — and records whichever identifier it used
 * on the profile, so every later pull takes the stronger path.
 */
@Injectable()
export class OpenAlexPullService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: OpenAlexLookupService,
    private readonly ingest: OpenAlexIngestService,
  ) {}

  /**
   * The author candidates for the researcher.
   *
   * The confirmed author comes back on its own when the profile carries
   * an id or an ORCID — there is nothing to choose in that case. The
   * name mode is the suggestion list, and it is a list of *suggestions*:
   * the researcher ticks the one that is theirs.
   */
  async findAuthorCandidates(
    userId: string,
  ): Promise<OpenAlexAuthorCandidatesDto> {
    const result = await this.lookup.findCandidates(userId);
    if (result.mode === 'NAME') {
      return {
        mode: 'NAME',
        authors: result.authors.map((entry) =>
          toAuthorCandidate(entry.author, entry.affiliationMatch),
        ),
      };
    }
    return {
      mode: result.mode,
      authors: [toAuthorCandidate(result.author, true)],
    };
  }

  /**
   * The works OpenAlex holds for the researcher, before the pull.
   *
   * The author id may be given explicitly — that is the onboarding
   * step, where the researcher picked an author from the candidate list.
   * Without one, the lookup resolves the researcher through the confirmed
   * chain.
   */
  async findAvailableWorks(
    userId: string,
    authorId?: string,
  ): Promise<OpenAlexWorkPreviewDto[]> {
    const picked = shortAuthorId(authorId);
    if (picked !== null) {
      const works = await this.lookup.findWorksForAuthor(picked);
      return works.map(toWorkPreview);
    }

    const identity = await this.resolveIdentity(userId);
    if (identity.openAlexAuthorId) {
      const works = await this.lookup.findWorksForAuthor(
        identity.openAlexAuthorId,
      );
      return works.map(toWorkPreview);
    }
    if (identity.orcid) {
      const author = await this.lookup.findCandidates(userId);
      if (author.mode === 'ORCID') {
        const works = await this.lookup.findWorksForAuthor(
          author.author.shortId || author.author.id,
        );
        return works.map(toWorkPreview);
      }
    }
    const works = await this.lookup.findWorksByAuthorName(identity.name);
    return works.map(toWorkPreview);
  }

  /**
   * Pulls the researcher's works into the platform as candidates.
   *
   * The pull is idempotent: a work already stored is re-linked, never
   * duplicated, and a decision the researcher already made is never
   * resurrected.
   *
   * The author the pull resolved is recorded on the profile when the
   * researcher confirmed it during onboarding, so the next pull takes the
   * stronger path.
   */
  async pull(
    userId: string,
    body: PullOpenAlexWorksDto,
  ): Promise<PullOpenAlexWorksResultDto> {
    const identity = await this.resolveIdentity(userId);

    // The researcher picked an author during onboarding. Record it, so
    // every later pull resolves through it.
    const picked = shortAuthorId(body.openAlexAuthorId);
    if (picked !== null) {
      await this.prisma.researcher_profiles.upsert({
        where: { user_id: userId },
        create: { user_id: userId, openalex_author_id: picked },
        update: { openalex_author_id: picked },
      });
      identity.openAlexAuthorId = picked;
    }

    const resolution = await this.resolveWorks(userId, identity);
    if (resolution.mode === 'NAME' && resolution.works.length === 0) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    let created = 0;
    let existing = 0;
    for (const work of resolution.works) {
      const result = await this.ingest.upsertWork(userId, work);
      if (result.created) {
        created += 1;
      } else {
        existing += 1;
      }
    }

    await this.prisma.researcher_profiles.upsert({
      where: { user_id: userId },
      create: { user_id: userId, last_synced_at: new Date() },
      update: { last_synced_at: new Date() },
    });

    return {
      mode: resolution.mode,
      authorId: resolution.authorId,
      worksScanned: resolution.works.length,
      candidatesCreated: created,
      candidatesExisting: existing,
    };
  }

  /**
   * Resolves the works to pull.
   *
   * The confirmed chain: the OpenAlex author id, then the ORCID, then
   * the byline name plus the hard-coded FPT University affiliation.
   */
  private async resolveWorks(
    userId: string,
    identity: ResearcherIdentity,
  ): Promise<{
    mode: 'AUTHOR_ID' | 'ORCID' | 'NAME';
    authorId: string | null;
    works: OpenAlexWork[];
  }> {
    if (identity.openAlexAuthorId) {
      const works = await this.lookup.listWorksForAuthor(
        identity.openAlexAuthorId,
        { identity },
      );
      return {
        mode: 'AUTHOR_ID',
        authorId: shortAuthorId(identity.openAlexAuthorId),
        works,
      };
    }
    if (identity.orcid) {
      // The ORCID tier is a best effort: an ORCID that was never linked
      // to an OpenAlex profile resolves to nothing, and the name tier
      // takes over. `findCandidates` already falls through to it.
      const author = await this.lookup.findCandidates(userId);
      if (author.mode === 'ORCID') {
        const works = await this.lookup.listWorksForAuthor(
          author.author.shortId || author.author.id,
          { identity },
        );
        return {
          mode: 'ORCID',
          authorId: author.author.shortId,
          works,
        };
      }
    }
    const works = await this.lookup.listWorksByAuthorName(identity.name);
    return { mode: 'NAME', authorId: null, works };
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
   * name, so the fallback works without a profile row; the row is
   * created on the first write that needs it.
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
}

function toAuthorCandidate(
  author: OpenAlexAuthor,
  affiliationMatch: boolean,
): OpenAlexAuthorCandidateDto {
  return {
    id: author.id,
    shortId: author.shortId,
    displayName: author.displayName,
    orcid: author.orcid,
    worksCount: author.worksCount,
    affiliations: author.affiliations,
    affiliationMatch,
  };
}

function toWorkPreview(work: {
  workId: string;
  shortId: string;
  title: string;
  doi: string | null;
  publicationYear: number | null;
  outputType: string;
  venue: string | null;
  confirmed: boolean;
}): OpenAlexWorkPreviewDto {
  return {
    workId: work.workId,
    shortId: work.shortId,
    title: work.title,
    doi: work.doi,
    publicationYear: work.publicationYear,
    outputType: work.outputType,
    venue: work.venue,
    confirmed: work.confirmed,
  };
}
