import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  buildPaginationMeta,
  MAX_PAGE_SIZE,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import { ListOutputsQueryDto } from './dto/list-outputs-query.dto.js';
import { OutputAuthorResponseDto } from './dto/output-author-response.dto.js';
import { OutputFileResponseDto } from './dto/output-file-response.dto.js';
import {
  OutputResponseDto,
  PaginatedOutputsResponseDto,
} from './dto/output-response.dto.js';
import { OutputRevisionResponseDto } from './dto/output-revision-response.dto.js';
import { OutputTopicResponseDto } from './dto/output-topic-response.dto.js';

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

@Injectable()
export class OutputsService {
  constructor(private readonly prisma: PrismaService) {}

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
