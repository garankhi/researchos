import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import {
  OutputFileVisibility,
  OutputSharingStatus,
  Prisma,
  PrismaService,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  buildPaginationMeta,
  MAX_PAGE_SIZE,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import { ProvenanceService } from '../provenance/provenance.service.js';
import { ListOutputsQueryDto } from './dto/list-outputs-query.dto.js';
import { OutputAuthorResponseDto } from './dto/output-author-response.dto.js';
import { OutputFileResponseDto } from './dto/output-file-response.dto.js';
import {
  OutputResponseDto,
  PaginatedOutputsResponseDto,
} from './dto/output-response.dto.js';
import { OutputRevisionResponseDto } from './dto/output-revision-response.dto.js';
import { OutputTopicResponseDto } from './dto/output-topic-response.dto.js';
import { PublishOutputDto } from './dto/publish-output.dto.js';
import { UpdateOutputRevisionDto } from './dto/update-output-revision.dto.js';

const OUTPUT_SORT_FIELDS = {
  firstSharedAt: 'first_shared_at',
  first_shared_at: 'first_shared_at',
  createdAt: 'created_at',
  created_at: 'created_at',
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
} as const;

type OutputSortColumn =
  (typeof OUTPUT_SORT_FIELDS)[keyof typeof OUTPUT_SORT_FIELDS];

interface OutputFileRow {
  id: string;
  output_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: bigint | number;
  sha256: string;
  visibility: any;
  access_group_id: string | null;
  uploaded_at: Date;
}

/**
 * The `field_provenance.entity_type` for the metadata of a work.
 *
 * The same value the OpenAlex ingest writes, so a human correction and a
 * machine pull describe the same field rather than two different ones.
 */
const OUTPUT_ENTITY = 'OUTPUT';

/**
 * The metadata fields a human may correct on a draft revision, mapped to
 * the `field_provenance.field_name` they are recorded under.
 *
 * `authors` is absent on purpose: the authorship list is not editable
 * here, so there is no field to lock.
 */
const EDITABLE_PROVENANCE_FIELDS = {
  title: 'title',
  abstract: 'abstract',
  venue: 'venue',
  publicationYear: 'publication_year',
} as const;

@Injectable()
export class OutputsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provenance: ProvenanceService,
  ) {}

  /**
   * Lists visible research outputs for the caller.
   *
   * Enforces that:
   * - A caller only sees outputs where `can_view_output(callerId, o.id)` is true.
   * - A DRAFT output is only returned if `o.owner_id = callerId`.
   * - Filtering by `userId`, `groupId` or `authorId` narrows the result set.
   */
  async findAll(
    callerId: string,
    query: ListOutputsQueryDto,
  ): Promise<PaginatedOutputsResponseDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const parsedSort = parseSortParam<OutputSortColumn>(
      query.sort,
      OUTPUT_SORT_FIELDS,
      { created_at: 'desc' },
    );
    if (!parsedSort) {
      throw new BadRequestException('validation_failed');
    }

    const sortColumn = Object.keys(parsedSort)[0] as OutputSortColumn;
    const sortDir = parsedSort[sortColumn] ?? 'desc';
    const orderBySql =
      sortColumn === 'first_shared_at'
        ? sortDir === 'asc'
          ? Prisma.sql`o.first_shared_at ASC NULLS LAST, o.created_at ASC`
          : Prisma.sql`o.first_shared_at DESC NULLS LAST, o.created_at DESC`
        : sortColumn === 'updated_at'
          ? sortDir === 'asc'
            ? Prisma.sql`o.updated_at ASC, o.id ASC`
            : Prisma.sql`o.updated_at DESC, o.id DESC`
          : sortDir === 'asc'
            ? Prisma.sql`o.created_at ASC, o.id ASC`
            : Prisma.sql`o.created_at DESC, o.id DESC`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`can_view_output(${callerId}::uuid, o.id)`,
    ];

    if (query.userId) {
      conditions.push(Prisma.sql`o.owner_id = ${query.userId}::uuid`);
    }

    if (query.groupId) {
      conditions.push(
        Prisma.sql`(o.access_group_id = ${query.groupId}::uuid OR EXISTS (
          SELECT 1 FROM group_output_links gol
          WHERE gol.output_id = o.id AND gol.group_id = ${query.groupId}::uuid AND gol.status = 'ACCEPTED'
        ))`,
      );
    }

    if (query.authorId) {
      // `userId` filters the owner; this one finds the co-authored works
      // whose `owner_id` belongs to somebody else. `output_authors.user_id`
      // is indexed, so the lookup stays index-backed.
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM output_authors oa
          WHERE oa.output_id = o.id AND oa.user_id = ${query.authorId}::uuid
        )`,
      );
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    const [countResult, idsResult] = await this.prisma.$transaction(
      async (tx) => {
        const count = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS total
          FROM research_outputs o
          ${whereClause}
        `);

        const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT o.id
          FROM research_outputs o
          ${whereClause}
          ORDER BY ${orderBySql}
          LIMIT ${limit}
          OFFSET ${offset}
        `);

        return [count, ids];
      },
    );

    const total = Number(countResult[0]?.total ?? 0n);
    if (total === 0 || idsResult.length === 0) {
      return {
        items: [],
        meta: buildPaginationMeta({ page, limit }, 0, total),
      };
    }

    const outputIds = idsResult.map((r) => r.id);
    const outputs = await this.prisma.research_outputs.findMany({
      where: { id: { in: outputIds } },
      include: {
        output_authors: {
          orderBy: { author_order: 'asc' },
        },
      },
    });

    const outputMap = new Map(outputs.map((o) => [o.id, o]));
    const orderedOutputs = outputIds
      .map((id) => outputMap.get(id))
      .filter((o): o is NonNullable<typeof o> => Boolean(o));

    const pinnedRevisionIds = orderedOutputs
      .map((o) => o.current_release_id)
      .filter((id): id is string => Boolean(id));

    // Fallback for draft owner copies that have not pinned a release yet
    const draftOutputIds = orderedOutputs
      .filter((o) => !o.current_release_id)
      .map((o) => o.id);

    const [pinnedRevisions, draftRevisions, outputTopics] = await Promise.all([
      pinnedRevisionIds.length > 0
        ? this.prisma.output_revisions.findMany({
            where: { id: { in: pinnedRevisionIds } },
          })
        : [],
      draftOutputIds.length > 0
        ? this.prisma.output_revisions.findMany({
            where: {
              output_id: { in: draftOutputIds },
              released_at: null,
            },
          })
        : [],
      this.prisma.output_topics.findMany({
        where: { output_id: { in: outputIds } },
        include: {
          research_topics: {
            include: {
              research_subfields: {
                include: {
                  research_fields: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const revisionMap = new Map<string, any>();
    for (const r of pinnedRevisions) {
      revisionMap.set(r.id, r);
    }

    const draftRevisionMap = new Map<string, any>();
    for (const r of draftRevisions) {
      draftRevisionMap.set(r.output_id, r);
    }

    const topicMap = new Map<string, OutputTopicResponseDto[]>();
    for (const ot of outputTopics) {
      const topic = ot.research_topics;
      const subfield = topic.research_subfields;
      const field = subfield.research_fields;

      const list = topicMap.get(ot.output_id) ?? [];
      list.push({
        topicId: topic.id,
        topicName: topic.name,
        subfieldId: subfield.id,
        subfieldName: subfield.name,
        fieldId: field.id,
        fieldName: field.name,
      });
      topicMap.set(ot.output_id, list);
    }

    const items = orderedOutputs.map((o) => {
      const pinnedRev = o.current_release_id
        ? revisionMap.get(o.current_release_id)
        : draftRevisionMap.get(o.id);

      return this.mapToOutputResponse(
        o,
        pinnedRev ?? null,
        o.output_authors,
        topicMap.get(o.id) ?? [],
      );
    });

    return {
      items,
      meta: buildPaginationMeta({ page, limit }, items.length, total),
    };
  }

  /**
   * Retrieves single output details with its pinned release, authors, and topics.
   *
   * Throws:
   * - 404 if the output does not exist.
   * - 403 if the output exists but caller has no view permission.
   */
  async findOne(
    outputId: string,
    callerId: string,
  ): Promise<OutputResponseDto> {
    const exists = await this.prisma.research_outputs.findUnique({
      where: { id: outputId },
      include: {
        output_authors: {
          orderBy: { author_order: 'asc' },
        },
      },
    });

    if (!exists) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const [allowed] = await this.prisma.$queryRaw<{ allowed: boolean }[]>`
      SELECT can_view_output(${callerId}::uuid, ${outputId}::uuid) AS allowed
    `;

    if (!allowed?.allowed) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }

    let revision = exists.current_release_id
      ? await this.prisma.output_revisions.findUnique({
          where: { id: exists.current_release_id },
        })
      : null;

    if (!revision && exists.owner_id === callerId) {
      revision = await this.prisma.output_revisions.findFirst({
        where: { output_id: outputId, released_at: null },
      });
    }

    const outputTopics = await this.prisma.output_topics.findMany({
      where: { output_id: outputId },
      include: {
        research_topics: {
          include: {
            research_subfields: {
              include: {
                research_fields: true,
              },
            },
          },
        },
      },
    });

    const topics: OutputTopicResponseDto[] = outputTopics.map((ot) => ({
      topicId: ot.research_topics.id,
      topicName: ot.research_topics.name,
      subfieldId: ot.research_topics.research_subfields.id,
      subfieldName: ot.research_topics.research_subfields.name,
      fieldId: ot.research_topics.research_subfields.research_fields.id,
      fieldName: ot.research_topics.research_subfields.research_fields.name,
    }));

    return this.mapToOutputResponse(
      exists,
      revision,
      exists.output_authors,
      topics,
    );
  }

  /**
   * Lists all revisions belonging to a visible research output.
   */
  async findRevisions(
    outputId: string,
    callerId: string,
  ): Promise<OutputRevisionResponseDto[]> {
    await this.assertCanViewOutput(outputId, callerId);

    const revisions = await this.prisma.output_revisions.findMany({
      where: { output_id: outputId },
      orderBy: { revision_no: 'desc' },
    });

    return revisions.map((r) => this.mapToRevisionResponse(r));
  }

  /**
   * Lists files attached to the research output that the caller is authorized to view.
   */
  async findFiles(
    outputId: string,
    callerId: string,
  ): Promise<OutputFileResponseDto[]> {
    await this.assertCanViewOutput(outputId, callerId);

    const files = await this.prisma.$queryRaw<OutputFileRow[]>`
      SELECT f.id, f.output_id, f.file_name, f.mime_type, f.size_bytes, f.sha256,
             f.visibility, f.access_group_id, f.uploaded_at
      FROM output_files f
      WHERE f.output_id = ${outputId}::uuid
        AND f.is_available = true
        AND can_view_output_file(${callerId}::uuid, f.id)
      ORDER BY f.uploaded_at DESC, f.id ASC
    `;

    return files.map((f) => ({
      id: f.id,
      outputId: f.output_id,
      fileName: f.file_name,
      mimeType: f.mime_type,
      sizeBytes: Number(f.size_bytes),
      sha256: f.sha256,
      visibility: f.visibility,
      accessGroupId: f.access_group_id,
      uploadedAt:
        f.uploaded_at instanceof Date
          ? f.uploaded_at.toISOString()
          : new Date(f.uploaded_at).toISOString(),
    }));
  }

  /**
   * Corrects the metadata of a work's editable draft revision.
   *
   * Only the owner may edit, and only while the revision is still a
   * draft: a released revision is immutable, so the service refuses
   * rather than writing a value the database would reject.
   *
   * Every corrected field is locked for the field-provenance writer
   * (`confirmField`), so a later OpenAlex re-pull cannot silently
   * overwrite a value a person stood behind. The lock is one-way:
   * human wins over machine.
   *
   * The write updates the existing draft row in place. The partial
   * unique index `uq_output_editable_draft` allows exactly one editable
   * draft per output, so this endpoint never creates a second one.
   */
  async updateRevision(
    outputId: string,
    callerId: string,
    dto: UpdateOutputRevisionDto,
  ): Promise<OutputRevisionResponseDto> {
    const output = await this.prisma.research_outputs.findUnique({
      where: { id: outputId },
      select: { id: true, owner_id: true },
    });

    if (!output) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    if (output.owner_id !== callerId) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputNotOwner,
        HttpStatus.FORBIDDEN,
      );
    }

    const draft = await this.prisma.output_revisions.findFirst({
      where: { output_id: outputId, released_at: null },
    });

    if (!draft) {
      // Either the work was never published and has no draft, or it was
      // published and its revision was frozen. Both mean there is nothing
      // this endpoint may write.
      const released = await this.prisma.output_revisions.findFirst({
        where: { output_id: outputId, released_at: { not: null } },
        select: { id: true },
      });

      throw new CodedHttpException(
        released
          ? domainErrorCodes.outputs.outputRevisionLocked
          : domainErrorCodes.outputs.outputRevisionNotFound,
        released ? HttpStatus.CONFLICT : HttpStatus.NOT_FOUND,
      );
    }

    const data: Record<string, unknown> = {};

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (title === '') {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotPublishable,
          HttpStatus.BAD_REQUEST,
        );
      }
      data['title'] = title;
    }
    if (dto.abstract !== undefined) {
      data['abstract'] = dto.abstract === null ? null : dto.abstract.trim();
    }
    if (dto.venue !== undefined) {
      data['venue'] = dto.venue === null ? null : dto.venue.trim();
    }
    if (dto.publicationYear !== undefined) {
      data['publication_year'] = dto.publicationYear;
    }
    if (dto.externalUrl !== undefined) {
      data['external_url'] = dto.externalUrl;
    }
    if (dto.outputType !== undefined) {
      data['output_type'] = dto.outputType.trim();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.output_revisions.update({
        where: { id: draft.id },
        data,
      });

      // Lock every corrected field against the next sync. The provenance
      // writer is the only path that sets `is_locked`, so this is the only
      // place the lock can come from.
      for (const [key, fieldName] of Object.entries(
        EDITABLE_PROVENANCE_FIELDS,
      )) {
        if (dto[key as keyof UpdateOutputRevisionDto] === undefined) {
          continue;
        }
        await this.provenance.confirmField(tx, {
          entityType: OUTPUT_ENTITY,
          entityId: outputId,
          fieldName,
        });
      }

      return row;
    });

    return this.mapToRevisionResponse(updated);
  }

  /**
   * Publishes a work: releases its draft revision and shares it.
   *
   * This is the single visibility action, whether the draft came from an
   * OpenAlex pull or from a work created inside the platform. The
   * endpoint is origin-blind on purpose — `import_state` records where
   * the work came from, `sharing_status` records whether it is shared.
   *
   * The three writes happen in one transaction, because the database
   * refuses a partial state: `ck_shared_output` requires a shared output
   * to have an owner, a pinned release and a first-shared timestamp, and
   * `guard_output_release` only accepts a pinned release that points at a
   * released revision.
   *
   * `import_state` and `provenance_tag` are untouched, and
   * `publication_status` is untouched too: a preprint shared internally
   * is still unpublished in its journal.
   *
   * The visibility decision is the caller's, but the access group is
   * checked: the caller has to be a member of the group it scopes the
   * work to, so a work cannot be pointed at a group the caller does not
   * belong to.
   */
  async publish(
    outputId: string,
    callerId: string,
    dto: PublishOutputDto,
  ): Promise<OutputResponseDto> {
    const isGroupScope = dto.visibility === OutputFileVisibility.RESEARCH_GROUP;

    if (isGroupScope && !dto.accessGroupId) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputVisibilityInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!isGroupScope && dto.accessGroupId) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputVisibilityInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const output = await tx.research_outputs.findUnique({
        where: { id: outputId },
        select: {
          id: true,
          owner_id: true,
          sharing_status: true,
          current_release_id: true,
        },
      });

      if (!output) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotFound,
          HttpStatus.NOT_FOUND,
        );
      }

      if (output.owner_id !== callerId) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotOwner,
          HttpStatus.FORBIDDEN,
        );
      }

      if (output.sharing_status === OutputSharingStatus.SHARED) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputAlreadyPublished,
          HttpStatus.CONFLICT,
        );
      }

      if (isGroupScope) {
        const [member] = await tx.$queryRaw<{ allowed: boolean }[]>`
          SELECT is_group_member(${callerId}::uuid, ${dto.accessGroupId}::uuid) AS allowed
        `;
        if (!member?.allowed) {
          throw new CodedHttpException(
            domainErrorCodes.outputs.outputAccessGroupInvalid,
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const draft = await tx.output_revisions.findFirst({
        where: { output_id: outputId, released_at: null },
      });

      if (!draft) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotPublishable,
          HttpStatus.CONFLICT,
        );
      }

      const now = await this.now(tx);

      // Step 1: release the draft revision. `guard_revision` refuses a
      // release by anybody but the owner, and refuses an empty title.
      const released = await tx.output_revisions.update({
        where: { id: draft.id },
        data: { released_at: now, released_by: callerId },
      });

      // Steps 2-4: pin the released revision, share the work, and set
      // the visibility the caller chose. `guard_output_release` checks
      // that the pinned revision is a released one, and `ck_shared_output`
      // checks that a shared work has an owner, a pin and a first-shared
      // timestamp — all three land in this same update.
      await tx.research_outputs.update({
        where: { id: outputId },
        data: {
          current_release_id: released.id,
          sharing_status: OutputSharingStatus.SHARED,
          first_shared_at: now,
          visibility: dto.visibility,
          access_group_id: isGroupScope ? dto.accessGroupId : null,
        },
      });

      return this.loadResponse(tx, outputId);
    });
  }

  /**
   * Archives a published work, taking it out of every shared surface.
   *
   * Archiving is the only way to un-share: the trigger
   * `guard_output_release` refuses to reset a shared work back to draft,
   * because the sharing history is not erasable. The work keeps its
   * revisions, its claims and its group links — only its visibility
   * ends.
   *
   * `first_shared_at` is preserved, so the work keeps the history of
   * when it was first shared.
   */
  async archive(
    outputId: string,
    callerId: string,
  ): Promise<OutputResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const output = await tx.research_outputs.findUnique({
        where: { id: outputId },
        select: { id: true, owner_id: true, sharing_status: true },
      });

      if (!output) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotFound,
          HttpStatus.NOT_FOUND,
        );
      }

      if (output.owner_id !== callerId) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotOwner,
          HttpStatus.FORBIDDEN,
        );
      }

      if (output.sharing_status !== OutputSharingStatus.SHARED) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotArchived,
          HttpStatus.CONFLICT,
        );
      }

      const now = await this.now(tx);

      // `ck_output_archive` ties the ARCHIVED status to the timestamp, so
      // both land in the same update.
      await tx.research_outputs.update({
        where: { id: outputId },
        data: {
          sharing_status: OutputSharingStatus.ARCHIVED,
          archived_at: now,
        },
      });

      return this.loadResponse(tx, outputId);
    });
  }

  /**
   * Reads the response shape of an output.
   *
   * The caller of this helper is the owner (the mutation paths check that
   * first), so the read needs no second permission check.
   */
  private async loadResponse(
    tx: Prisma.TransactionClient,
    outputId: string,
  ): Promise<OutputResponseDto> {
    const output = await tx.research_outputs.findUnique({
      where: { id: outputId },
      include: { output_authors: { orderBy: { author_order: 'asc' } } },
    });

    if (!output) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const revision = output.current_release_id
      ? await tx.output_revisions.findUnique({
          where: { id: output.current_release_id },
        })
      : null;

    const outputTopics = await tx.output_topics.findMany({
      where: { output_id: outputId },
      include: {
        research_topics: {
          include: {
            research_subfields: { include: { research_fields: true } },
          },
        },
      },
    });

    const topics: OutputTopicResponseDto[] = outputTopics.map((ot) => ({
      topicId: ot.research_topics.id,
      topicName: ot.research_topics.name,
      subfieldId: ot.research_topics.research_subfields.id,
      subfieldName: ot.research_topics.research_subfields.name,
      fieldId: ot.research_topics.research_subfields.research_fields.id,
      fieldName: ot.research_topics.research_subfields.research_fields.name,
    }));

    return this.mapToOutputResponse(
      output,
      revision,
      output.output_authors,
      topics,
    );
  }

  /** The database's own clock, so the server and the database agree. */
  private async now(tx: Prisma.TransactionClient): Promise<Date> {
    const [row] = await tx.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now
    `;
    return row.now;
  }

  private async assertCanViewOutput(
    outputId: string,
    callerId: string,
  ): Promise<void> {
    const exists = await this.prisma.research_outputs.findUnique({
      where: { id: outputId },
      select: { id: true },
    });

    if (!exists) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const [allowed] = await this.prisma.$queryRaw<{ allowed: boolean }[]>`
      SELECT can_view_output(${callerId}::uuid, ${outputId}::uuid) AS allowed
    `;

    if (!allowed?.allowed) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputAccessDenied,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private mapToOutputResponse(
    o: any,
    revision: any,
    authors: any[],
    topics: OutputTopicResponseDto[],
  ): OutputResponseDto {
    return {
      id: o.id,
      doi: o.doi ?? null,
      ownerId: o.owner_id ?? null,
      sharingStatus: o.sharing_status,
      visibility: o.visibility,
      accessGroupId: o.access_group_id ?? null,
      importState: o.import_state,
      currentReleaseId: o.current_release_id ?? null,
      firstSharedAt: o.first_shared_at ? o.first_shared_at.toISOString() : null,
      currentRevision: revision ? this.mapToRevisionResponse(revision) : null,
      authors: authors.map((a) => this.mapToAuthorResponse(a)),
      topics,
    };
  }

  private mapToRevisionResponse(r: any): OutputRevisionResponseDto {
    return {
      id: r.id,
      outputId: r.output_id,
      revisionNo: r.revision_no,
      title: r.title,
      abstract: r.abstract ?? null,
      venue: r.venue ?? null,
      publisher: r.publisher ?? null,
      publicationYear: r.publication_year ?? null,
      publicationStatus: r.publication_status,
      outputType: r.output_type,
      externalUrl: r.external_url ?? null,
      releasedAt: r.released_at ? r.released_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
    };
  }

  private mapToAuthorResponse(a: any): OutputAuthorResponseDto {
    return {
      id: a.id,
      outputId: a.output_id,
      userId: a.user_id ?? null,
      authorNameString: a.author_name_string,
      authorOrder: a.author_order,
      isCorrespondingAuthor: a.is_corresponding_author,
    };
  }
}
