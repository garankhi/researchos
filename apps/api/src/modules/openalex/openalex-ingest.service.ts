import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  OPENALEX_FIELD_PROVENANCE,
  type OpenAlexProvenanceField,
  ProvenanceService,
} from '../provenance/provenance.service.js';
import { OpenAlexClient } from './openalex.client.js';
import type { OpenAlexWork } from './openalex.types.js';

/** The `output_external_ids.source` convention for OpenAlex rows. */
export const OPENALEX_SOURCE = 'OPENALEX';

/** The `field_provenance.entity_type` for ingested works. */
export const OPENALEX_ENTITY = 'OUTPUT';

/** Result of an ingest: the persisted work and whether it was inserted. */
export interface IngestResult {
  /** The `research_outputs.id` the work lives at. */
  outputId: string;
  /** True when this call inserted the work; false for a re-import/attach. */
  created: boolean;
  /**
   * The `author_order` of the requesting researcher when their ORCID
   * matches an authorship, otherwise null. Informational — RES-155 uses
   * it to link the claim.
   */
  authorOrder: number | null;
}

/**
 * Normalises an ORCID for comparison.
 *
 * OpenAlex reports the URL form (`https://orcid.org/0000-...`) while the
 * profile may hold the bare form. Both land on the same key.
 */
function normalizeOrcid(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const orcid = value
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/(dx\.)?orcid\.org\/|orcid:\s*)/, '')
    .trim();
  return orcid === '' ? null : orcid;
}

/**
 * The work upsert half of the pull (RES-137).
 *
 * Turns a shaped OpenAlex work into a persisted candidate:
 * `research_outputs` (`import_state = 'CANDIDATE'`, `sharing_status =
 * 'DRAFT'`, `visibility = 'PRIVATE'`, `owner_id = NULL`), one draft
 * `output_revisions` row (`revision_no = 1`, `publisher = NULL` —
 * OpenAlex has no publisher, that null is correct), the authorship rows
 * and the `output_external_ids` link. Provenance rows land in the same
 * transaction through `ProvenanceService`.
 *
 * Two paths, one transaction:
 *
 * - *Insert*: no `output_external_ids` row for the OpenAlex id and no
 *   `research_outputs` row for the DOI — the work is new.
 * - *Attach*: the work already exists (same external id = re-import, or
 *   same DOI = a second author accepts it). The service never inserts a
 *   second `research_outputs` row and never touches `owner_id`; it links
 *   the requesting researcher to their authorship row and records the
 *   second external id when the DOI matched first.
 *
 * Idempotent: re-importing the same work returns the same `outputId`
 * with `created = false` and only bumps `synced_at`.
 */
@Injectable()
export class OpenAlexIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: OpenAlexClient,
    private readonly provenance: ProvenanceService,
  ) {}

  /**
   * Fetches one work by OpenAlex id and upserts it for the researcher.
   *
   * `GET /works/<work_id>` first (venue, year, abstract, authors, DOI),
   * then the upsert. A fetch failure surfaces the client's domain code.
   */
  async ingestWork(userId: string, workId: string): Promise<IngestResult> {
    const work = await this.client.getWork(workId);
    return this.upsertWork(userId, work);
  }

  /** Ingests several works in order; each work is its own transaction. */
  async ingestWorks(
    userId: string,
    workIds: string[],
  ): Promise<IngestResult[]> {
    const out: IngestResult[] = [];
    for (const workId of workIds) {
      out.push(await this.ingestWork(userId, workId));
    }
    return out;
  }

  /**
   * Upserts an already-fetched work for the researcher.
   *
   * Split from `ingestWork` so the lookup (RES-134) can feed shaped works
   * straight in without a second fetch per item.
   */
  async upsertWork(userId: string, work: OpenAlexWork): Promise<IngestResult> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const sourceRef = `OPENALEX:${work.shortId || work.id}`;

      // Re-import: the external-id primary key is the upsert key.
      const linked = await tx.output_external_ids.findUnique({
        where: {
          source_external_id: {
            source: OPENALEX_SOURCE,
            external_id: work.id,
          },
        },
        select: { output_id: true },
      });
      if (linked) {
        const authorOrder = await this.attachAuthorship(
          tx,
          linked.output_id,
          userId,
          work,
        );
        await this.recordWorkProvenance(
          tx,
          linked.output_id,
          work,
          sourceRef,
          now,
        );
        return { outputId: linked.output_id, created: false, authorOrder };
      }

      // Attach: the DOI is unique, so a second author lands on the same row.
      if (work.doi) {
        const existing = await tx.research_outputs.findUnique({
          where: { doi: work.doi },
          select: { id: true },
        });
        if (existing) {
          await tx.output_external_ids.upsert({
            where: {
              source_external_id: {
                source: OPENALEX_SOURCE,
                external_id: work.id,
              },
            },
            create: {
              output_id: existing.id,
              source: OPENALEX_SOURCE,
              external_id: work.id,
              last_synced_at: now,
            },
            update: { last_synced_at: now },
          });
          const authorOrder = await this.attachAuthorship(
            tx,
            existing.id,
            userId,
            work,
          );
          await this.recordWorkProvenance(
            tx,
            existing.id,
            work,
            sourceRef,
            now,
          );
          return { outputId: existing.id, created: false, authorOrder };
        }
      }

      // Insert: a candidate nobody owns yet. `current_release_id` stays
      // NULL — `guard_output_release` only accepts a released revision.
      const profile = await tx.researcher_profiles.findUnique({
        where: { user_id: userId },
        select: { orcid_id: true },
      });
      if (!profile) {
        throw new CodedHttpException(
          domainErrorCodes.profiles.profileNotFound,
          HttpStatus.NOT_FOUND,
        );
      }
      const matchedOrder = this.matchAuthorOrder(profile.orcid_id, work);

      const output = await tx.research_outputs.create({
        data: {
          doi: work.doi,
          owner_id: null,
          created_by: userId,
          sharing_status: 'DRAFT',
          visibility: 'PRIVATE',
          access_group_id: null,
          current_release_id: null,
          import_state: 'CANDIDATE',
          last_synced_at: now,
        },
        select: { id: true },
      });

      const title = work.title === '' ? 'Untitled work' : work.title;
      const revision = await tx.output_revisions.create({
        data: {
          output_id: output.id,
          revision_no: 1,
          title,
          abstract: work.abstract,
          venue: work.venue,
          publisher: null,
          publication_year: work.publicationYear,
          output_type: work.outputType,
          external_url: work.url,
          authors_snapshot: work.authors.map((author) => ({
            name: author.name === '' ? 'Unknown author' : author.name,
            order: author.order,
            orcid: author.orcid,
            isCorresponding: author.isCorresponding,
          })),
          created_by: userId,
        },
        select: { id: true },
      });
      void revision;

      await tx.output_external_ids.create({
        data: {
          output_id: output.id,
          source: OPENALEX_SOURCE,
          external_id: work.id,
          last_synced_at: now,
        },
      });

      for (const author of work.authors) {
        await tx.output_authors.create({
          data: {
            output_id: output.id,
            user_id: author.order === matchedOrder ? userId : null,
            author_name_string:
              author.name === '' ? 'Unknown author' : author.name,
            author_order: author.order,
            is_corresponding_author: author.isCorresponding,
          },
        });
      }

      await this.recordWorkProvenance(tx, output.id, work, sourceRef, now);
      return { outputId: output.id, created: true, authorOrder: matchedOrder };
    });
  }

  /**
   * Links the requesting researcher to their authorship row.
   *
   * Already linked → no-op. ORCID matches an authorship whose row has no
   * user yet → claim that position. No match and no existing link → leave
   * the rows alone; the SUGGESTED claim (RES-155) still makes the work
   * visible. Never inserts a work row, never touches `owner_id`.
   */
  private async attachAuthorship(
    tx: Prisma.TransactionClient,
    outputId: string,
    userId: string,
    work: OpenAlexWork,
  ): Promise<number | null> {
    const linked = await tx.output_authors.findFirst({
      where: { output_id: outputId, user_id: userId },
      select: { author_order: true },
    });
    if (linked) {
      return linked.author_order;
    }

    const profile = await tx.researcher_profiles.findUnique({
      where: { user_id: userId },
      select: { orcid_id: true },
    });
    if (!profile) {
      throw new CodedHttpException(
        domainErrorCodes.profiles.profileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    const matchedOrder = this.matchAuthorOrder(profile.orcid_id, work);
    if (matchedOrder === null) {
      return null;
    }

    const row = await tx.output_authors.findUnique({
      where: {
        output_id_author_order: {
          output_id: outputId,
          author_order: matchedOrder,
        },
      },
      select: { user_id: true },
    });
    // Another researcher already holds the position, or the row was never
    // ingested — either way the authorship is not ours to take.
    if (!row || (row.user_id !== null && row.user_id !== userId)) {
      return matchedOrder;
    }
    if (row.user_id === null) {
      await tx.output_authors.update({
        where: {
          output_id_author_order: {
            output_id: outputId,
            author_order: matchedOrder,
          },
        },
        data: { user_id: userId },
      });
    }
    return matchedOrder;
  }

  /**
   * Finds the requesting researcher's position in the author list.
   *
   * ORCID comparison only — a name-only match is never authoritative
   * (Vietnamese names collide), so it yields null here.
   */
  private matchAuthorOrder(
    orcidId: string | null,
    work: OpenAlexWork,
  ): number | null {
    const needle = normalizeOrcid(orcidId);
    if (!needle) {
      return null;
    }
    const match = work.authors.find(
      (author) => normalizeOrcid(author.orcid) === needle,
    );
    return match ? match.order : null;
  }

  /**
   * Writes the field provenance for one ingested work.
   *
   * One row per field the ingest wrote, through the RES-14 writer, with
   * `source_ref = OPENALEX:<work id>` and the class from
   * `OPENALEX_FIELD_PROVENANCE`. Null fields were not written, so they
   * get no row — except `title`/`authors`, which always land.
   */
  private async recordWorkProvenance(
    tx: Prisma.TransactionClient,
    outputId: string,
    work: OpenAlexWork,
    sourceRef: string,
    syncedAt: Date,
  ): Promise<void> {
    const values: Record<string, unknown> = {
      title: work.title,
      abstract: work.abstract,
      authors: work.authors,
      venue: work.venue,
      publication_year: work.publicationYear,
      doi: work.doi,
    };
    const fields = Object.keys(
      OPENALEX_FIELD_PROVENANCE,
    ) as OpenAlexProvenanceField[];
    for (const field of fields) {
      const value = values[field];
      if (value === null || value === undefined) {
        continue;
      }
      if (Array.isArray(value) && value.length === 0) {
        continue;
      }
      await this.provenance.recordProvenance(tx, {
        entityType: OPENALEX_ENTITY,
        entityId: outputId,
        fieldName: field,
        source: OPENALEX_FIELD_PROVENANCE[field],
        sourceRef,
        syncedAt,
      });
    }
  }
}
