import { HttpStatus, Injectable } from '@nestjs/common';
import {
  OutputAudience,
  OutputImportState,
  OutputSharingStatus,
  OutputType,
  Prisma,
  PrismaService,
  type ClaimStatus,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { buildPaginationMeta } from '../../common/dto/pagination.dto.js';
import { completeArticleByline } from '../outputs/article-byline.js';
import {
  AcceptCandidateDto,
  CandidateVisibility,
} from './dto/accept-candidate.dto.js';
import {
  CandidateWorkDto,
  CandidateWorksCountDto,
  PaginatedCandidateWorksResponseDto,
} from './dto/candidate-work-response.dto.js';
import { CandidateDecisionDto } from './dto/candidate-decision-response.dto.js';
import { ListCandidateWorksQueryDto } from './dto/list-candidate-works.query.dto.js';
import {
  resolveSnapshotOrder,
  type ResearcherIdentity,
} from './openalex.identity.js';
import { OPENALEX_SOURCE } from './openalex-ingest.service.js';

/**
 * Whether an accept also publishes the work.
 *
 * The default is the private working copy: the researcher publishes it
 * themselves when they are ready. Only an explicit community choice
 * publishes.
 */
function shouldPublish(visibility: CandidateVisibility | undefined): boolean {
  return visibility === CandidateVisibility.FPTU_COMMUNITY;
}

/** One row of the suggestion queue: the work id and its DOI. */
interface SuggestionRow {
  /** The `research_outputs.id` of the candidate. */
  id: string;
  /** The normalised DOI, or null when the work has none. */
  doi: string | null;
}

/** The editable draft revision a candidate is read through. */
interface DraftRevision {
  title: string;
  abstract: string | null;
  venue: string | null;
  publication_year: number | null;
  output_type: string;
  external_url: string | null;
  authors_snapshot: unknown;
}

/** The caller's own claim row on a candidate. */
interface ClaimRow {
  status: ClaimStatus;
  match_source: string;
}

/** A locked work row: the state a decision reads and writes. */
interface LockedOutput {
  /** The `research_outputs.id` under decision. */
  id: string;
  /** The import state before the decision. */
  import_state: OutputImportState;
  /** The owner before the decision, if any. */
  owner_id: string | null;
}

/**
 * Reads author display names out of a revision's authors snapshot.
 *
 * The snapshot is the `[{ name, order, ... }]` array the ingest wrote, in
 * arbitrary order. Entries without a usable name fall back to
 * `Unknown author`, matching the ingest's own fallback. Anything that is
 * not an array yields no authors rather than a crash.
 */
function toAuthorNames(snapshot: unknown): string[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }
  return snapshot
    .filter(
      (entry): entry is { name?: unknown; order?: unknown } =>
        typeof entry === 'object' && entry !== null,
    )
    .sort((a, b) => toOrder(a.order) - toOrder(b.order))
    .map((entry) =>
      typeof entry.name === 'string' && entry.name !== ''
        ? entry.name
        : 'Unknown author',
    );
}

function toOrder(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The stored-candidate reads of the pull (RES-138).
 *
 * Lists the candidates the ingest (RES-137) persisted with
 * `import_state = 'CANDIDATE'` and counts the ones still awaiting the
 * researcher's decision, for the entry card. Both read the stored rows —
 * never OpenAlex — through `visible_candidate_suggestions`, so a rejected
 * work stays a candidate and only leaves *this* researcher's queue, while
 * a co-author still sees it.
 *
 * The researcher always comes from the session: a caller only ever sees
 * their own candidates.
 */
@Injectable()
export class OpenAlexCandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists the caller's stored candidates, newest pull first.
   *
   * Each item carries the draft revision (title, abstract, venue, year,
   * type, URL, authors), the OpenAlex id from the external-id link and
   * the caller's own claim row. Storage failures propagate as 500s —
   * this endpoint never calls the external API.
   */
  async findAll(
    userId: string,
    query: ListCandidateWorksQueryDto,
  ): Promise<PaginatedCandidateWorksResponseDto> {
    return this.listCandidates(userId, query, (tx) =>
      this.readSuggestions(tx, userId, query),
    );
  }

  /**
   * Lists the candidates the caller rejected, newest pull first.
   *
   * A rejection is never a deletion: the claim row stays `REJECTED` and
   * the work stays `CANDIDATE`, so the work is still there to accept
   * later. This is the read of that list, through
   * `visible_rejected_candidates`.
   */
  async findRejected(
    userId: string,
    query: ListCandidateWorksQueryDto,
  ): Promise<PaginatedCandidateWorksResponseDto> {
    return this.listCandidates(userId, query, (tx) =>
      this.readRejections(tx, userId, query),
    );
  }

  /**
   * The shared read of the stored candidates.
   *
   * The two lists differ only in the view they read — the suggestions
   * exclude a rejected claim, the rejections are exactly the rejected
   * claims — so the paging, the hydration and the shaping are one
   * implementation.
   */
  private async listCandidates(
    userId: string,
    query: ListCandidateWorksQueryDto,
    read: (
      tx: Prisma.TransactionClient,
    ) => Promise<{ rows: SuggestionRow[]; total: number }>,
  ): Promise<PaginatedCandidateWorksResponseDto> {
    const { rows, total } = await this.prisma.$transaction(read, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });

    if (rows.length === 0) {
      return { items: [], meta: buildPaginationMeta(query, 0, total) };
    }

    const ids = rows.map((row) => row.id);
    const [revisions, externalIds, claims] = await Promise.all([
      this.prisma.output_revisions.findMany({
        where: { output_id: { in: ids }, released_at: null },
      }),
      this.prisma.output_external_ids.findMany({
        where: { output_id: { in: ids }, source: OPENALEX_SOURCE },
        orderBy: { external_id: 'asc' },
      }),
      this.prisma.publication_claims.findMany({
        where: { output_id: { in: ids }, user_id: userId },
      }),
    ]);

    const revisionByOutput = new Map(
      revisions.map((revision) => [revision.output_id, revision]),
    );
    // A work can carry two OpenAlex rows (the re-import id plus the
    // DOI-match id); the first one identifies the candidate.
    const externalByOutput = new Map<string, string>();
    for (const link of externalIds) {
      if (!externalByOutput.has(link.output_id)) {
        externalByOutput.set(link.output_id, link.external_id);
      }
    }
    const claimByOutput = new Map(
      claims.map((claim) => [claim.output_id, claim]),
    );

    const items = rows.map((row) =>
      this.toCandidate(
        row,
        revisionByOutput.get(row.id),
        externalByOutput.get(row.id) ?? null,
        claimByOutput.get(row.id) ?? null,
      ),
    );
    return { items, meta: buildPaginationMeta(query, items.length, total) };
  }

  /**
   * The paged read of the suggestion queue.
   *
   * `visible_candidate_suggestions` is the caller's own view of the
   * candidates: the works they pulled, minus the ones they rejected.
   */
  private async readSuggestions(
    tx: Prisma.TransactionClient,
    userId: string,
    query: ListCandidateWorksQueryDto,
  ): Promise<{ rows: SuggestionRow[]; total: number }> {
    const rows = await tx.$queryRaw<SuggestionRow[]>`
      SELECT o.id, s.doi
      FROM visible_candidate_suggestions(${userId}::uuid) AS s
      JOIN research_outputs AS o ON o.id = s.output_id
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `;
    const [count] = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
      FROM visible_candidate_suggestions(${userId}::uuid) AS s
    `;
    return { rows, total: Number(count?.total ?? 0n) };
  }

  /**
   * The paged read of the rejection list.
   *
   * `visible_rejected_candidates` is the caller's own view of the works
   * they rejected. The rows are never deleted, so every one of them can
   * still be accepted later.
   */
  private async readRejections(
    tx: Prisma.TransactionClient,
    userId: string,
    query: ListCandidateWorksQueryDto,
  ): Promise<{ rows: SuggestionRow[]; total: number }> {
    const rows = await tx.$queryRaw<SuggestionRow[]>`
      SELECT o.id, s.doi
      FROM visible_rejected_candidates(${userId}::uuid) AS s
      JOIN research_outputs AS o ON o.id = s.output_id
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `;
    const [count] = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
      FROM visible_rejected_candidates(${userId}::uuid) AS s
    `;
    return { rows, total: Number(count?.total ?? 0n) };
  }

  /**
   * Counts the caller's candidates still awaiting a decision.
   *
   * Cheap by design: it answers without the full list, so the entry card
   * can render before the pull runs.
   */
  async count(userId: string): Promise<CandidateWorksCountDto> {
    const [row] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
      FROM visible_candidate_suggestions(${userId}::uuid) AS s
    `;
    return { count: Number(row?.total ?? 0n) };
  }

  /**
   * Accepts a candidate on the caller's behalf (RES-141).
   *
   * Accepting is a validation act, not a publication act: the work moves
   * `CANDIDATE -> ACCEPTED` with the caller as owner (the first claimer
   * wins — a co-author accepting an already-accepted work attaches without
   * taking `owner_id` over), while `sharing_status` stays `DRAFT`,
   * `audience` stays `PRIVATE` and `current_release_id` is never set
   * (`guard_output_release` only accepts a released revision). The
   * caller's claim becomes `CONFIRMED` with `reviewed_at` set and
   * `author_id` pointing at their own `output_authors` row, satisfying
   * `ck_claim_review` and `ck_confirmed_claim_author`. The authorship
   * link is resolved inside the same transaction, after the ingest's
   * attach pattern: an existing link is reused, otherwise the identity
   * chain — the confirmed OpenAlex author id, the ORCID, then the name
   * plus the hard-coded FPT University affiliation — is matched against
   * the draft snapshot and the free position is claimed.
   *
   * Reversible in one direction: accepting after a rejection confirms the
   * same claim row. Repeating an accept returns the current state.
   */
  async accept(
    userId: string,
    outputId: string,
    body: AcceptCandidateDto = {},
  ): Promise<CandidateDecisionDto> {
    return this.prisma.$transaction(async (tx) => {
      const output = await this.lockOutput(tx, outputId);
      await this.requireResearcher(tx, userId);
      await this.requireDecisionAccess(tx, userId, outputId, output);

      const claim = await tx.publication_claims.findUnique({
        where: { output_id_user_id: { output_id: outputId, user_id: userId } },
      });
      if (claim?.status === 'CONFIRMED') {
        return this.toDecision(output, 'CONFIRMED');
      }

      const authorId = await this.resolveAuthorId(tx, userId, outputId, claim);
      const now = new Date();

      if (claim) {
        await tx.publication_claims.update({
          where: {
            output_id_user_id: { output_id: outputId, user_id: userId },
          },
          data: { status: 'CONFIRMED', reviewed_at: now, author_id: authorId },
        });
      } else {
        await tx.publication_claims.create({
          data: {
            output_id: outputId,
            user_id: userId,
            status: 'CONFIRMED',
            match_source: 'REVIEW',
            author_id: authorId,
            reviewed_at: now,
          },
        });
      }

      // The first claimer takes ownership; a co-author accepting an
      // already-accepted work attaches without touching `owner_id`
      // (the read path for that case is RES-154).
      if (output.import_state === OutputImportState.CANDIDATE) {
        const updated = await tx.research_outputs.update({
          where: { id: outputId },
          data: {
            import_state: OutputImportState.ACCEPTED,
            owner_id: output.owner_id ?? userId,
          },
          select: { id: true, import_state: true, owner_id: true },
        });
        if (shouldPublish(body.visibility)) {
          await this.publishAccepted(tx, userId, outputId);
        }
        return this.toDecision(updated, 'CONFIRMED');
      }
      if (shouldPublish(body.visibility)) {
        await this.publishAccepted(tx, userId, outputId);
      }
      return this.toDecision(output, 'CONFIRMED');
    });
  }

  /**
   * Publishes an accepted candidate to the FPTU community.
   *
   * The accept and the publish share one transaction, so a failure to
   * publish rolls the accept back rather than leaving a half-published
   * work behind. The publish is the same act the outputs module performs:
   * the draft revision is released and pinned, and the audience is set.
   *
   * A personal work has no container, so its audience is the community —
   * the same rule `OutputsService.publishAudience` applies.
   */
  private async publishAccepted(
    tx: Prisma.TransactionClient,
    userId: string,
    outputId: string,
  ): Promise<void> {
    const draft = await tx.output_revisions.findFirst({
      where: { output_id: outputId, released_at: null },
    });
    if (!draft) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputNotPublishable,
        HttpStatus.CONFLICT,
      );
    }

    const authors = await tx.output_authors.findMany({
      where: { output_id: outputId },
      orderBy: { author_order: 'asc' },
    });
    const authorsSnapshot =
      draft.output_type === OutputType.ARTICLE
        ? completeArticleByline(draft.authors_snapshot, authors)
        : undefined;

    const now = new Date();
    await tx.output_revisions.update({
      where: { id: draft.id },
      data: {
        released_at: now,
        released_by: userId,
        ...(authorsSnapshot === undefined
          ? {}
          : { authors_snapshot: authorsSnapshot }),
      },
    });
    await tx.research_outputs.update({
      where: { id: outputId },
      data: {
        current_release_id: draft.id,
        sharing_status: OutputSharingStatus.SHARED,
        first_shared_at: now,
        audience: OutputAudience.FPTU_COMMUNITY,
        access_group_id: null,
      },
    });
  }

  /**
   * Rejects a candidate on the caller's behalf (RES-141).
   *
   * The rejection is per-researcher and reversible: only the caller's own
   * claim row moves to `REJECTED` with `reviewed_at` set. The work itself
   * never changes — it stays `import_state = 'CANDIDATE'` so a co-author
   * still gets it as a suggestion, and the rejected work stays reachable
   * in the rejection list for a later accept. Rejecting an already
   * accepted work the caller owns is refused: ownership is not undone by
   * a claim transition.
   */
  async reject(
    userId: string,
    outputId: string,
  ): Promise<CandidateDecisionDto> {
    return this.prisma.$transaction(async (tx) => {
      const output = await this.lockOutput(tx, outputId);
      await this.requireResearcher(tx, userId);
      await this.requireDecisionAccess(tx, userId, outputId, output);

      const claim = await tx.publication_claims.findUnique({
        where: { output_id_user_id: { output_id: outputId, user_id: userId } },
      });
      if (claim?.status === 'REJECTED') {
        return this.toDecision(output, 'REJECTED');
      }
      if (
        output.import_state === OutputImportState.ACCEPTED &&
        claim?.status === 'CONFIRMED' &&
        output.owner_id === userId
      ) {
        throw new CodedHttpException(
          domainErrorCodes.openalex.decisionDenied,
          HttpStatus.CONFLICT,
        );
      }

      const now = new Date();
      if (claim) {
        await tx.publication_claims.update({
          where: {
            output_id_user_id: { output_id: outputId, user_id: userId },
          },
          data: { status: 'REJECTED', reviewed_at: now },
        });
      } else {
        await tx.publication_claims.create({
          data: {
            output_id: outputId,
            user_id: userId,
            status: 'REJECTED',
            match_source: 'REVIEW',
            author_id: null,
            reviewed_at: now,
          },
        });
      }
      return this.toDecision(output, 'REJECTED');
    });
  }

  private async lockOutput(
    tx: Prisma.TransactionClient,
    outputId: string,
  ): Promise<LockedOutput> {
    const rows = await tx.$queryRaw<LockedOutput[]>`
      SELECT o.id, o.import_state, o.owner_id
      FROM research_outputs AS o
      WHERE o.id = ${outputId}::uuid
      FOR UPDATE OF o
    `;
    const output = rows[0];
    if (!output) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.workNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    return output;
  }

  private async requireResearcher(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const [result] = await tx.$queryRaw<{ allowed: boolean }[]>`
      SELECT is_researcher(${userId}::uuid) AS allowed
    `;
    if (!result?.allowed) {
      throw new CodedHttpException(
        domainErrorCodes.identity.researcherRequired,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Whether the caller may decide on this work.
   *
   * A candidate is decided through `can_view_candidate` — the caller has
   * a claim for it or pulled it themselves. An already-accepted work
   * leaves the candidate set, so a repeated accept or an owner reject is
   * still reachable through the caller's own claim row or ownership;
   * anything else is a missing work rather than a forbidden one, so the
   * existence of the row does not leak.
   */
  private async requireDecisionAccess(
    tx: Prisma.TransactionClient,
    userId: string,
    outputId: string,
    output: LockedOutput,
  ): Promise<void> {
    if (
      output.import_state !== OutputImportState.CANDIDATE &&
      output.import_state !== OutputImportState.ACCEPTED
    ) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.workNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const [view] = await tx.$queryRaw<{ allowed: boolean }[]>`
      SELECT can_view_candidate(${userId}::uuid, ${outputId}::uuid) AS allowed
    `;
    if (view?.allowed) {
      return;
    }
    if (output.import_state === OutputImportState.ACCEPTED) {
      if (output.owner_id === userId) {
        return;
      }
      const claim = await tx.publication_claims.findUnique({
        where: { output_id_user_id: { output_id: outputId, user_id: userId } },
        select: { status: true },
      });
      if (claim) {
        return;
      }
    }
    throw new CodedHttpException(
      domainErrorCodes.openalex.workNotFound,
      HttpStatus.NOT_FOUND,
    );
  }

  /**
   * Resolves the caller's authorship row for a confirm.
   *
   * `ck_confirmed_claim_author` requires every `CONFIRMED` claim to name
   * its author, so an accept without a linkable position fails instead of
   * writing a row the database would reject. The chain:
   *
   * 1. the claim's own `author_id` — a decision that already happened;
   * 2. an existing `output_authors` link for this researcher;
   * 3. the identity chain against the stored draft snapshot — the
   *    confirmed OpenAlex author id, then the ORCID, then the name plus
   *    the hard-coded FPT University affiliation.
   *
   * The third step is what lets a researcher with no OpenAlex and no
   * ORCID profile accept their work at all. It is strict: an ambiguous
   * name match resolves to nothing, and a position held by another
   * researcher is an author conflict.
   */
  private async resolveAuthorId(
    tx: Prisma.TransactionClient,
    userId: string,
    outputId: string,
    claim: { author_id: string | null } | null,
  ): Promise<string> {
    if (claim?.author_id) {
      return claim.author_id;
    }
    const linked = await tx.output_authors.findFirst({
      where: { output_id: outputId, user_id: userId },
      select: { id: true },
    });
    if (linked) {
      return linked.id;
    }

    const identity = await this.resolveIdentity(tx, userId);
    const revision = await tx.output_revisions.findFirst({
      where: { output_id: outputId, released_at: null },
      select: { authors_snapshot: true },
    });
    const order = resolveSnapshotOrder(revision?.authors_snapshot, identity);
    if (order === null) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const row = await tx.output_authors.findUnique({
      where: {
        output_id_author_order: { output_id: outputId, author_order: order },
      },
      select: { id: true, user_id: true },
    });
    if (!row || (row.user_id !== null && row.user_id !== userId)) {
      throw new CodedHttpException(
        domainErrorCodes.openalex.authorConflict,
        HttpStatus.CONFLICT,
      );
    }
    if (row.user_id === null) {
      await tx.output_authors.update({
        where: {
          output_id_author_order: { output_id: outputId, author_order: order },
        },
        data: { user_id: userId },
      });
    }
    return row.id;
  }

  /**
   * Reads the researcher's identity signals from the database.
   *
   * The confirmed OpenAlex author id, the ORCID, and the account name.
   * The affiliation is not read — it is the hard-coded FPT University.
   *
   * The profile row is **optional**: a fresh researcher may have none,
   * and the account row still carries the name the name tier matches on.
   */
  private async resolveIdentity(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<ResearcherIdentity> {
    const profile = await tx.researcher_profiles.findUnique({
      where: { user_id: userId },
      select: {
        orcid_id: true,
        openalex_author_id: true,
        users: { select: { full_name: true } },
      },
    });
    const account = await tx.users.findUnique({
      where: { id: userId },
      select: { full_name: true },
    });
    return {
      openAlexAuthorId: profile?.openalex_author_id ?? null,
      orcid: profile?.orcid_id ?? null,
      name: profile?.users.full_name ?? account?.full_name ?? '',
    };
  }

  private toDecision(
    output: LockedOutput,
    claimStatus: ClaimStatus,
  ): CandidateDecisionDto {
    return {
      id: output.id,
      importState: output.import_state,
      claimStatus,
      ownerId: output.owner_id,
    };
  }

  private toCandidate(
    row: SuggestionRow,
    revision: DraftRevision | undefined,
    openalexId: string | null,
    claim: ClaimRow | null,
  ): CandidateWorkDto {
    return {
      id: row.id,
      openalexId,
      doi: row.doi,
      // The ingest always writes a draft revision, so a missing one is
      // corrupt data rather than an empty candidate — fall back instead
      // of 500ing the whole page.
      title: revision?.title ?? 'Untitled work',
      abstract: revision?.abstract ?? null,
      venue: revision?.venue ?? null,
      publicationYear: revision?.publication_year ?? null,
      outputType: revision?.output_type ?? OutputType.ARTICLE,
      url: revision?.external_url ?? null,
      authors: toAuthorNames(revision?.authors_snapshot),
      claimStatus: claim?.status ?? null,
      matchSource: claim?.match_source ?? null,
    };
  }
}
