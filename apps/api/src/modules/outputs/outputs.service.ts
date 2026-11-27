import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import {
  DataProvenanceType,
  OutputAudience,
  OutputFileVisibility,
  OutputScopeType,
  OutputSharingStatus,
  OutputType,
  Prisma,
  PrismaService,
  PublicationStatusEnum,
  type OutputAuthor,
  type OutputRevision,
  type ResearchOutput,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { normalizeArticleDoi } from '@researchos/publication-metadata';
import { readDatabaseFailure } from '../../common/errors/database-errors.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  buildPaginationMeta,
  MAX_PAGE_SIZE,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import { ProvenanceService } from '../provenance/provenance.service.js';
import { ArticleCreationUploadService } from '../storage/article-creation-upload.service.js';
import {
  completeArticleByline,
  readArticleByline,
  snapshotAuthors,
} from './article-byline.js';
import {
  normalizeArticleMetadata,
  normalizePublicationDate,
} from './article-metadata.js';
import type {
  ArticlePdfRevisionResponseDto,
  AttachArticlePdfDto,
  AttachArticlePdfResponseDto,
  UpdateArticlePdfVisibilityDto,
} from './dto/article-pdf.dto.js';
import type {
  CreateArticleDto,
  CreateArticleResponseDto,
} from './dto/create-article.dto.js';
import { HomeFeedQueryDto, HomeFeedResponseDto } from './dto/home-feed.dto.js';
import { ListOutputsQueryDto } from './dto/list-outputs-query.dto.js';
import { OutputAuthorResponseDto } from './dto/output-author-response.dto.js';
import { OutputFileResponseDto } from './dto/output-file-response.dto.js';
import {
  DownloadablePdfDto,
  OutputResponseDto,
  PaginatedOutputsResponseDto,
} from './dto/output-response.dto.js';
import { OutputRevisionResponseDto } from './dto/output-revision-response.dto.js';
import type { OutputScopeDto } from './dto/output-scope.dto.js';
import { OutputTopicResponseDto } from './dto/output-topic-response.dto.js';
import { PublishOutputDto } from './dto/publish-output.dto.js';
import type { UpdateArticleAbstractDto } from './dto/update-article-abstract.dto.js';
import type { UpdateArticleDto } from './dto/update-article.dto.js';
import { UpdateOutputRevisionDto } from './dto/update-output-revision.dto.js';
import { UpdateOutputVisibilityDto } from './dto/update-output-visibility.dto.js';
import {
  formatHomeFeedCursor,
  parseHomeFeedCursor,
  type HomeFeedCursor,
} from './home-feed-cursor.js';

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
  visibility: OutputFileVisibility;
  access_group_id: string | null;
  uploaded_at: Date | string;
  is_current_release_attachment: boolean;
}

type ArticleRelease = Prisma.output_revisionsGetPayload<{
  include: {
    output_revision_files: {
      include: {
        output_files: { select: { mime_type: true; is_available: true } };
      };
    };
  };
}>;

interface FeedPdfRow {
  output_id: string;
  id: string;
  file_name: string;
}

/**
 * The `field_provenance.entity_type` for the metadata of a work.
 *
 * The same value the OpenAlex ingest writes, so a human correction and a
 * machine pull describe the same field rather than two different ones.
 */
const OUTPUT_ENTITY = 'OUTPUT';

/**
 * The draft fields tracked by the metadata provenance writer.
 *
 * `authors` is absent on purpose: the authorship list is not editable
 * here, so there is no field to lock.
 */
const EDITABLE_PROVENANCE_FIELDS = [
  'title',
  'abstract',
  'venue',
  'publication_year',
] as const;

@Injectable()
export class OutputsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provenance: ProvenanceService,
    private readonly articleUploads: ArticleCreationUploadService,
  ) {}

  /**
   * Resolves where a work is posted and who may read it.
   *
   * The scope is fixed at creation, because moving a work to another
   * container would silently change who may edit it. The audience follows
   * it: a personal work starts private - the owner-only draft - and a
   * container work inherits the default audience of its group.
   *
   * The caller has to be a member of the group they post into. For a
   * project, the parent group is read from the project itself, so a
   * project post belongs to the whole group and the group leads manage
   * it too.
   *
   * `published` picks the personal audience: an unpublished personal work
   * is the owner-only draft, and a published one reaches the community.
   */
  private async resolveOutputScope(
    tx: Prisma.TransactionClient,
    callerId: string,
    scope: OutputScopeDto | undefined,
    published = false,
  ): Promise<{
    scopeType: OutputScopeType;
    scopeGroupId: string | null;
    scopeProjectId: string | null;
    audience: OutputAudience;
  }> {
    const scopeType = scope?.scopeType ?? OutputScopeType.PERSONAL;

    if (scopeType === OutputScopeType.PERSONAL) {
      return {
        scopeType,
        scopeGroupId: null,
        scopeProjectId: null,
        audience: published
          ? OutputAudience.FPTU_COMMUNITY
          : OutputAudience.PRIVATE,
      };
    }

    if (scopeType === OutputScopeType.GROUP) {
      if (!scope?.scopeGroupId) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputScopeInvalid,
          HttpStatus.BAD_REQUEST,
        );
      }
      const [member] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT is_group_member(${callerId}::uuid, ${scope.scopeGroupId}::uuid) AS allowed
      `;
      if (!member?.allowed) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputScopeInvalid,
          HttpStatus.BAD_REQUEST,
        );
      }
      const [row] = await tx.$queryRaw<{ audience: OutputAudience }[]>`
        SELECT group_default_audience(${scope.scopeGroupId}::uuid) AS audience
      `;
      return {
        scopeType,
        scopeGroupId: scope.scopeGroupId,
        scopeProjectId: null,
        audience: this.containerAudience(row?.audience),
      };
    }

    if (!scope?.scopeProjectId) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputScopeInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }

    // The project carries its parent group. Reading it here keeps the
    // scope honest: a project post is readable by the whole group, so the
    // scope names that group and the group leads manage the post too.
    const [project] = await tx.$queryRaw<
      { lead_id: string; group_id: string | null }[]
    >`
      SELECT lead_id, group_id
      FROM research_projects
      WHERE id = ${scope.scopeProjectId}::uuid
        AND archived_at IS NULL
    `;
    if (!project) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputScopeInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }

    const [member] = await tx.$queryRaw<{ allowed: boolean }[]>`
      SELECT is_researcher(${callerId}::uuid) AND (
        EXISTS (
          SELECT 1 FROM research_projects p
          WHERE p.id = ${scope.scopeProjectId}::uuid AND p.lead_id = ${callerId}::uuid
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = ${scope.scopeProjectId}::uuid AND pm.user_id = ${callerId}::uuid
        )
        OR (
          ${project.group_id}::uuid IS NOT NULL
          AND is_group_member(${callerId}::uuid, ${project.group_id}::uuid)
        )
      ) AS allowed
    `;
    if (!member?.allowed) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputScopeInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }

    const scopeGroupId = project.group_id ?? null;
    const [row] = await tx.$queryRaw<{ audience: OutputAudience }[]>`
      SELECT CASE
        WHEN ${scopeGroupId}::uuid IS NULL THEN 'CONTAINER'::output_audience
        ELSE group_default_audience(${scopeGroupId}::uuid)
      END AS audience
    `;
    return {
      scopeType,
      scopeGroupId,
      scopeProjectId: scope.scopeProjectId,
      audience: this.containerAudience(row?.audience),
    };
  }

  /**
   * A container work has two audiences: its container and the community.
   *
   * A group default of PRIVATE would leave a post nobody but its author
   * can read inside a group that is supposed to share it, so it falls
   * back to the container.
   */
  private containerAudience(
    wanted: OutputAudience | undefined,
  ): OutputAudience {
    return wanted === OutputAudience.FPTU_COMMUNITY
      ? OutputAudience.FPTU_COMMUNITY
      : OutputAudience.CONTAINER;
  }

  async createArticle(
    callerId: string,
    dto: CreateArticleDto,
    key?: string,
  ): Promise<CreateArticleResponseDto> {
    const requestKey = key?.trim();
    if (!requestKey || requestKey.length > 200) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputIdempotencyKeyInvalid,
        HttpStatus.BAD_REQUEST,
      );
    }
    const article = normalizeArticleMetadata(dto);
    const pdf =
      dto.uploadId && dto.fileVisibility
        ? {
            uploadId: dto.uploadId.toLowerCase(),
            fileVisibility: dto.fileVisibility,
          }
        : undefined;
    const hash = createHash('sha256')
      .update(JSON.stringify(pdf ? { ...article, pdf } : article))
      .digest('hex');

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [access] = await tx.$queryRaw<{ allowed: boolean }[]>`
          SELECT is_researcher(${callerId}::uuid) AS allowed
        `;
          if (!access?.allowed) {
            throw new CodedHttpException(
              domainErrorCodes.identity.researcherRequired,
              HttpStatus.FORBIDDEN,
            );
          }

          // Serialize retries across API processes. Under READ COMMITTED the
          // lookup after taking the lock can see the previous request's commit.
          const lockKey = `outputs:create:${callerId}:${requestKey}`;
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
          const previous = await tx.research_outputs.findUnique({
            where: {
              created_by_create_idempotency_key: {
                created_by: callerId,
                create_idempotency_key: requestKey,
              },
            },
            select: { id: true, create_request_hash: true },
          });
          if (previous) {
            if (previous.create_request_hash !== hash) {
              throw new CodedHttpException(
                domainErrorCodes.outputs.outputIdempotencyKeyConflict,
                HttpStatus.CONFLICT,
              );
            }
            const first = await tx.output_revisions.findUniqueOrThrow({
              where: {
                output_id_revision_no: {
                  output_id: previous.id,
                  revision_no: 1,
                },
              },
              select: { id: true },
            });
            return { outputId: previous.id, revisionId: first.id };
          }

          await this.validateArticleReferences(tx, article);
          const resolvedScope = await this.resolveOutputScope(
            tx,
            callerId,
            dto.scope,
            true,
          );
          const output = await tx.research_outputs.create({
            data: {
              doi: article.doi,
              owner_id: callerId,
              created_by: callerId,
              provenance_tag: DataProvenanceType.HUMAN,
              scope_type: resolvedScope.scopeType,
              scope_group_id: resolvedScope.scopeGroupId,
              scope_project_id: resolvedScope.scopeProjectId,
              audience: resolvedScope.audience,
              create_idempotency_key: requestKey,
              create_request_hash: hash,
            },
            select: { id: true },
          });
          const byline = article.authors.map((author) => ({
            id: randomUUID(),
            ...author,
          }));
          const revision = await tx.output_revisions.create({
            data: {
              output_id: output.id,
              revision_no: 1,
              title: article.title,
              abstract: article.abstract,
              venue: article.journal,
              publication_date: article.publicationDate,
              publication_year: Number(article.publicationDate.slice(0, 4)),
              publication_status: PublicationStatusEnum.PUBLISHED,
              output_type: OutputType.ARTICLE,
              volume: article.volume,
              issue: article.issue,
              pages: article.pages,
              peer_reviewed: article.peerReviewed,
              authors_snapshot: byline,
              created_by: callerId,
            },
            select: { id: true },
          });
          await tx.output_authors.createMany({
            data: byline.map(({ id, name, userId, order }) => ({
              id,
              output_id: output.id,
              author_name_string: name,
              user_id: userId,
              author_order: order,
            })),
          });
          if (article.topicIds.length > 0) {
            await tx.output_topics.createMany({
              data: article.topicIds.map((topicId) => ({
                output_id: output.id,
                revision_id: revision.id,
                topic_id: topicId,
                added_by: callerId,
              })),
            });
          }

          if (pdf) {
            await this.articleUploads.consumeVerifiedUpload(
              tx,
              callerId,
              pdf.uploadId,
              output.id,
              revision.id,
              pdf.fileVisibility,
            );
          }
          await this.releaseRevision(tx, {
            outputId: output.id,
            revisionId: revision.id,
            callerId,
            sharing: {
              audience: resolvedScope.audience,
              accessGroupId: null,
            },
          });
          return { outputId: output.id, revisionId: revision.id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        readDatabaseFailure(error)?.constraintName ===
        'research_outputs_doi_key'
      ) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputDoiConflict,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async validateArticleReferences(
    tx: Prisma.TransactionClient,
    {
      authors,
      topicIds,
    }: { authors: { userId: string | null }[]; topicIds: string[] },
  ): Promise<void> {
    const accountIds = authors.flatMap(({ userId }) =>
      userId ? [userId] : [],
    );
    if (accountIds.length > 0) {
      const count = await tx.users.count({
        where: { id: { in: accountIds }, is_active: true },
      });
      if (count !== accountIds.length) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputAuthorInvalid,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if (topicIds.length > 0) {
      const count = await tx.research_topics.count({
        where: { id: { in: topicIds }, is_active: true },
      });
      if (count !== topicIds.length) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputTopicInvalid,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

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
    const parsedSort = parseSortParam<OutputSortColumn>(
      query.sort,
      OUTPUT_SORT_FIELDS,
      { created_at: 'desc' },
    );
    if (!parsedSort) {
      throw new BadRequestException('validation_failed');
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`can_view_output(${callerId}::uuid, o.id)`,
    ];

    if (query.userId) {
      conditions.push(Prisma.sql`o.owner_id = ${query.userId}::uuid`);
    }

    if (query.groupId) {
      // A group's feed lists the works that group owns - the works whose
      // scope names it - and the works it has explicitly accepted.
      //
      // The affiliation banner is not ownership. A personal work that
      // merely carries a group's banner was never posted into that group,
      // and a group does not speak for it: the filter used to match the
      // banner, which put every banner-carrying personal work into the
      // group's feed, where every member could read it.
      conditions.push(
        Prisma.sql`(o.scope_group_id = ${query.groupId}::uuid OR EXISTS (
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

    const offset = (page - 1) * limit;
    const sortColumn = Object.keys(parsedSort)[0] as OutputSortColumn;
    const sortDir = parsedSort[sortColumn] ?? 'desc';
    const orderBySql =
      sortColumn === 'first_shared_at'
        ? sortDir === 'asc'
          ? Prisma.sql`o.first_shared_at ASC NULLS LAST, o.created_at ASC, o.id ASC`
          : Prisma.sql`o.first_shared_at DESC NULLS LAST, o.created_at DESC, o.id DESC`
        : sortColumn === 'updated_at'
          ? sortDir === 'asc'
            ? Prisma.sql`o.updated_at ASC, o.id ASC`
            : Prisma.sql`o.updated_at DESC, o.id DESC`
          : sortDir === 'asc'
            ? Prisma.sql`o.created_at ASC, o.id ASC`
            : Prisma.sql`o.created_at DESC, o.id DESC`;

    return this.prisma.$transaction(
      async (tx) => {
        const total = await this.countOutputs(tx, whereClause);
        const ids =
          total === 0
            ? []
            : await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT o.id
          FROM research_outputs o
          ${whereClause}
          ORDER BY ${orderBySql}
          LIMIT ${limit}
          OFFSET ${offset}
        `);

        const outputIds = ids.map((row) => row.id);
        const items = await this.loadOutputPage(tx, outputIds);
        return {
          items,
          meta: buildPaginationMeta({ page, limit }, items.length, total),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findHomeFeed(
    callerId: string,
    query: HomeFeedQueryDto,
  ): Promise<HomeFeedResponseDto> {
    const { limit } = query;
    const cursor =
      query.cursor === undefined
        ? undefined
        : parseHomeFeedCursor(query.cursor);
    const whereClause = Prisma.sql`
      WHERE can_view_output(${callerId}::uuid, o.id)
        AND o.sharing_status = 'SHARED'
        AND EXISTS (
          SELECT 1
          FROM output_revisions release
          WHERE release.id = o.current_release_id
            AND release.output_id = o.id
            AND release.released_at IS NOT NULL
        )
    `;
    const afterCursor = cursor
      ? Prisma.sql`AND (o.first_shared_at, o.id) < (${cursor.sharedAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty;

    return this.prisma.$transaction(
      async (tx) => {
        const total = await this.countOutputs(tx, whereClause);
        // Preserve PostgreSQL's microseconds for the cursor. A JavaScript Date
        // would truncate the timestamp used for the next page's comparison.
        const rows = await tx.$queryRaw<HomeFeedCursor[]>(Prisma.sql`
          SELECT o.id, to_char(o.first_shared_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "sharedAt"
          FROM research_outputs o
          ${whereClause}
          ${afterCursor}
          ORDER BY o.first_shared_at DESC, o.id DESC
          LIMIT ${limit + 1}
        `);
        const pageRows = rows.slice(0, limit);
        const lastRow = pageRows.at(-1);
        const nextCursor =
          lastRow && rows.length > limit
            ? formatHomeFeedCursor(lastRow)
            : undefined;
        const items = await this.loadOutputPage(
          tx,
          pageRows.map(({ id }) => id),
          callerId,
        );
        return { items, meta: { total, nextCursor } };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async countOutputs(
    tx: Prisma.TransactionClient,
    whereClause: Prisma.Sql,
  ): Promise<number> {
    const [count] = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM research_outputs o
      ${whereClause}
    `);
    return Number(count?.total ?? 0n);
  }

  private async loadOutputPage(
    tx: Prisma.TransactionClient,
    outputIds: string[],
    homeReaderId?: string,
  ): Promise<OutputResponseDto[]> {
    if (outputIds.length === 0) return [];

    const outputs = await tx.research_outputs.findMany({
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

    const [pinnedRevisions, draftRevisions, outputTopics, pdfs] =
      await Promise.all([
        pinnedRevisionIds.length > 0
          ? tx.output_revisions.findMany({
              where: { id: { in: pinnedRevisionIds } },
            })
          : [],
        draftOutputIds.length > 0
          ? tx.output_revisions.findMany({
              where: {
                output_id: { in: draftOutputIds },
                released_at: null,
              },
            })
          : [],
        tx.output_topics.findMany({
          where: {
            OR: [
              { revision_id: { in: pinnedRevisionIds } },
              {
                output_id: { in: draftOutputIds },
                output_revisions: { released_at: null },
              },
            ],
          },
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
        homeReaderId
          ? this.findFeedPdfs(tx, outputIds, homeReaderId)
          : new Map<string, DownloadablePdfDto>(),
      ]);

    const revisionMap = new Map<string, (typeof pinnedRevisions)[number]>();
    for (const r of pinnedRevisions) {
      revisionMap.set(r.id, r);
    }

    const draftRevisionMap = new Map<string, (typeof draftRevisions)[number]>();
    for (const r of draftRevisions) {
      draftRevisionMap.set(r.output_id, r);
    }

    const topicMap = new Map<string, OutputTopicResponseDto[]>();
    for (const ot of outputTopics) {
      const topic = ot.research_topics;
      const subfield = topic.research_subfields;
      const field = subfield.research_fields;

      const list = topicMap.get(ot.revision_id) ?? [];
      list.push({
        topicId: topic.id,
        topicName: topic.name,
        subfieldId: subfield.id,
        subfieldName: subfield.name,
        fieldId: field.id,
        fieldName: field.name,
      });
      topicMap.set(ot.revision_id, list);
    }

    return orderedOutputs.map((o) => {
      const pinnedRev = o.current_release_id
        ? revisionMap.get(o.current_release_id)
        : draftRevisionMap.get(o.id);

      const output = this.mapToOutputResponse(
        o,
        pinnedRev ?? null,
        o.output_authors,
        (pinnedRev && topicMap.get(pinnedRev.id)) ?? [],
      );
      const downloadablePdf = pdfs.get(o.id);
      return downloadablePdf ? { ...output, downloadablePdf } : output;
    });
  }

  private async findFeedPdfs(
    tx: Prisma.TransactionClient,
    outputIds: string[],
    callerId: string,
  ): Promise<Map<string, DownloadablePdfDto>> {
    const ids = Prisma.join(outputIds.map((id) => Prisma.sql`${id}::uuid`));
    const files = await tx.$queryRaw<FeedPdfRow[]>`
      SELECT DISTINCT ON (f.output_id) f.output_id, f.id, f.file_name
      FROM research_outputs o
      JOIN output_revision_files rf
        ON rf.output_id = o.id AND rf.revision_id = o.current_release_id
      JOIN output_files f ON f.id = rf.file_id AND f.output_id = o.id
      WHERE o.id IN (${ids})
        AND lower(f.mime_type) = 'application/pdf'
        AND can_view_output_file(${callerId}::uuid, f.id)
      ORDER BY f.output_id, f.uploaded_at DESC, f.id ASC
    `;

    return new Map(
      files.map((file) => [
        file.output_id,
        { id: file.id, fileName: file.file_name },
      ]),
    );
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

    // The database decides who may change the audience, so the client does
    // not have to re-implement the scope rules.
    const [capability] = await this.prisma.$queryRaw<{ allowed: boolean }[]>`
      SELECT can_change_output_visibility(${callerId}::uuid, ${outputId}::uuid) AS allowed
    `;

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

    const outputTopics = revision
      ? await this.prisma.output_topics.findMany({
          where: { revision_id: revision.id },
          include: {
            research_topics: {
              include: {
                research_subfields: { include: { research_fields: true } },
              },
            },
          },
        })
      : [];

    const topics: OutputTopicResponseDto[] = outputTopics.map((ot) => ({
      topicId: ot.research_topics.id,
      topicName: ot.research_topics.name,
      subfieldId: ot.research_topics.research_subfields.id,
      subfieldName: ot.research_topics.research_subfields.name,
      fieldId: ot.research_topics.research_subfields.research_fields.id,
      fieldName: ot.research_topics.research_subfields.research_fields.name,
    }));

    const output = this.mapToOutputResponse(
      exists,
      revision,
      exists.output_authors,
      topics,
      capability?.allowed ?? false,
    );
    if (!exists.current_release_id || exists.owner_id === callerId)
      return output;

    // Private files of the current release the caller may ask for (RES-176),
    // with the caller's latest request for each.
    const restricted = await this.prisma.$queryRaw<
      {
        id: string;
        file_name: string;
        mime_type: string;
        size_bytes: bigint;
        request_id: string | null;
        request_status: string | null;
      }[]
    >`
      SELECT f.id, f.file_name, f.mime_type, f.size_bytes,
             r.id AS request_id, r.status::text AS request_status
      FROM research_outputs o
      JOIN output_revision_files rf
        ON rf.output_id = o.id AND rf.revision_id = o.current_release_id
      JOIN output_files f ON f.id = rf.file_id AND f.output_id = o.id
      LEFT JOIN LATERAL (
        SELECT id, status FROM file_access_requests
        WHERE file_id = f.id AND requester_id = ${callerId}::uuid
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) r ON true
      WHERE o.id = ${outputId}::uuid
        AND o.current_release_id = ${exists.current_release_id}::uuid
        AND o.sharing_status = 'SHARED'
        AND can_view_output(${callerId}::uuid, o.id)
        AND f.visibility = 'PRIVATE'
        AND f.is_available
        AND NOT can_view_output_file(${callerId}::uuid, f.id)
      ORDER BY f.uploaded_at, f.id
    `;
    return {
      ...output,
      hasRestrictedPdf: restricted.some(
        (file) => file.mime_type.toLowerCase() === 'application/pdf',
      ),
      requestableFiles: restricted.map((file) => ({
        id: file.id,
        fileName: file.file_name,
        mimeType: file.mime_type,
        sizeBytes: Number(file.size_bytes),
        myRequest: file.request_id
          ? { id: file.request_id, status: file.request_status! }
          : null,
      })),
    };
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
             f.visibility, f.access_group_id, f.uploaded_at, EXISTS (
               SELECT 1 FROM output_revision_files rf
               WHERE rf.output_id = o.id AND rf.revision_id = o.current_release_id
                 AND rf.file_id = f.id
             ) AS is_current_release_attachment
      FROM output_files f JOIN research_outputs o ON o.id = f.output_id
      WHERE f.output_id = ${outputId}::uuid
        AND f.is_available = true
        AND can_view_output_file(${callerId}::uuid, f.id)
      ORDER BY f.uploaded_at DESC, f.id ASC
    `;

    return files.map((file) => this.mapToFileResponse(file));
  }

  private mapToFileResponse(f: OutputFileRow): OutputFileResponseDto {
    return {
      id: f.id,
      outputId: f.output_id,
      fileName: f.file_name,
      mimeType: f.mime_type,
      sizeBytes: Number(f.size_bytes),
      sha256: f.sha256,
      visibility: f.visibility,
      accessGroupId: f.access_group_id,
      isCurrentReleaseAttachment: f.is_current_release_attachment,
      uploadedAt:
        f.uploaded_at instanceof Date
          ? f.uploaded_at.toISOString()
          : new Date(f.uploaded_at).toISOString(),
    };
  }

  async updateArticle(
    outputId: string,
    callerId: string,
    {
      expectedRevisionId,
      doi,
      authors,
      topicIds,
      ...metadata
    }: UpdateArticleDto,
  ): Promise<OutputResponseDto> {
    const normalizedDoi = normalizeArticleDoi(doi);
    if (doi && !normalizedDoi) {
      throw new BadRequestException({ message: { doi: ['doi_invalid'] } });
    }
    const date =
      metadata.publicationDate === undefined
        ? undefined
        : normalizePublicationDate(metadata.publicationDate);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const release = await this.lockArticleRelease(tx, outputId, callerId);
        this.assertExpectedArticleRevision(release, expectedRevisionId);
        if (
          doi === undefined &&
          authors === undefined &&
          topicIds === undefined &&
          Object.values(metadata).every((value) => value === undefined)
        ) {
          return this.loadResponse(tx, outputId);
        }

        const selectedTopics = topicIds?.map((id) => id.toLowerCase());
        const uniqueTopics = selectedTopics && [...new Set(selectedTopics)];
        if (uniqueTopics) {
          const current = await tx.output_topics.findMany({
            where: { revision_id: release.id },
            select: { topic_id: true },
          });
          const currentIds = new Set(current.map((topic) => topic.topic_id));
          await this.validateArticleReferences(tx, {
            authors: [],
            topicIds: uniqueTopics.filter((id) => !currentIds.has(id)),
          });
        }

        const snapshot =
          authors === undefined
            ? undefined
            : await this.updateArticleByline(tx, release, authors);
        if (doi !== undefined) {
          await tx.research_outputs.update({
            where: { id: outputId },
            data: { doi: normalizedDoi },
          });
        }
        const revisionId = await this.copyArticleRevision(
          tx,
          release,
          callerId,
          {
            topicIds: uniqueTopics,
            metadata: {
              ...(metadata.title !== undefined && { title: metadata.title }),
              ...(metadata.abstract !== undefined && {
                abstract: metadata.abstract || null,
              }),
              ...(metadata.journal !== undefined && {
                venue: metadata.journal || null,
              }),
              ...(metadata.volume !== undefined && {
                volume: metadata.volume || null,
              }),
              ...(metadata.issue !== undefined && {
                issue: metadata.issue || null,
              }),
              ...(metadata.pages !== undefined && {
                pages: metadata.pages || null,
              }),
              ...(metadata.peerReviewed !== undefined && {
                peer_reviewed: metadata.peerReviewed,
              }),
              ...(date !== undefined && {
                publication_date: date,
                publication_year: Number(date.slice(0, 4)),
              }),
              ...(snapshot !== undefined && { authors_snapshot: snapshot }),
            },
          },
        );
        await this.releaseRevision(tx, { outputId, revisionId, callerId });
        return this.loadResponse(tx, outputId);
      });
    } catch (error) {
      if (
        readDatabaseFailure(error)?.constraintName ===
        'research_outputs_doi_key'
      ) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputDoiConflict,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async updateArticleByline(
    tx: Prisma.TransactionClient,
    release: ArticleRelease,
    authors: NonNullable<UpdateArticleDto['authors']>,
  ): Promise<Prisma.InputJsonArray> {
    const outputId = release.output_id;
    await tx.$queryRaw`
      SELECT id FROM output_authors WHERE output_id = ${outputId}::uuid FOR UPDATE
    `;
    const existing = await tx.output_authors.findMany({
      where: { output_id: outputId },
      include: { _count: { select: { publication_claims: true } } },
    });
    const byId = new Map(existing.map((author) => [author.id, author]));
    const byOrder = new Map(
      existing.map((author) => [author.author_order, author]),
    );
    const sourceByRowId = new Map(
      snapshotAuthors(release.authors_snapshot).flatMap((entry) => {
        if (typeof entry.id === 'string') return [[entry.id, entry] as const];
        const row = byOrder.get(entry.order);
        return row?.author_name_string === entry.name
          ? [[row.id, entry] as const]
          : [];
      }),
    );
    for (const author of readArticleByline(release)) {
      const row = byOrder.get(author.authorOrder);
      if (
        row &&
        row.author_name_string === author.authorNameString &&
        !byId.has(author.id)
      ) {
        byId.set(author.id, row);
      }
    }

    const retained = new Set<string>();
    const accounts = new Set<string>();
    const byline = authors.map(({ authorId, displayName, userId }, index) => {
      const row = authorId ? byId.get(authorId.toLowerCase()) : undefined;
      const account = row ? row.user_id : (userId?.toLowerCase() ?? null);
      if (
        (authorId && !row) ||
        (row && retained.has(row.id)) ||
        (account && accounts.has(account))
      ) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputAuthorInvalid,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (row) retained.add(row.id);
      if (account) accounts.add(account);
      const source = row ? sourceByRowId.get(row.id) : undefined;
      return {
        ...(typeof source?.openAlexAuthorId === 'string' && {
          openAlexAuthorId: source.openAlexAuthorId,
        }),
        ...(typeof source?.orcid === 'string' && { orcid: source.orcid }),
        id: row?.id ?? randomUUID(),
        name: displayName,
        userId: account,
        order: index + 1,
        isCorresponding: row?.is_corresponding_author ?? false,
      };
    });
    const removed = existing.filter((author) => !retained.has(author.id));
    if (removed.some((author) => author._count.publication_claims > 0)) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputAuthorClaimed,
        HttpStatus.CONFLICT,
      );
    }
    const added = byline.filter((author) => !retained.has(author.id));
    await this.validateArticleReferences(tx, { authors: added, topicIds: [] });
    if (removed.length > 0) {
      await tx.output_authors.deleteMany({
        where: {
          output_id: outputId,
          id: { in: removed.map((author) => author.id) },
        },
      });
    }
    const changed = byline.flatMap((author) => {
      const previous = byId.get(author.id);
      if (!previous) return [];
      const orderChanged = previous.author_order !== author.order;
      const nameChanged = previous.author_name_string !== author.name;
      return orderChanged || nameChanged
        ? [{ author, orderChanged, nameChanged }]
        : [];
    });
    const movedIds = changed
      .filter(({ orderChanged }) => orderChanged)
      .map(({ author }) => author.id);
    if (movedIds.length > 0) {
      // Disjoint temporary positions avoid collisions with the unique (output, order) index.
      const offset = existing.reduce(
        (max, author) => Math.max(max, author.author_order),
        byline.length,
      );
      await tx.output_authors.updateMany({
        where: { id: { in: movedIds } },
        data: { author_order: { increment: offset } },
      });
    }
    for (const { author, orderChanged, nameChanged } of changed) {
      await tx.output_authors.update({
        where: { id: author.id },
        data: {
          ...(orderChanged && { author_order: author.order }),
          ...(nameChanged && { author_name_string: author.name }),
        },
      });
    }
    if (added.length > 0) {
      await tx.output_authors.createMany({
        data: added.map(({ id, name, userId, order }) => ({
          id,
          output_id: outputId,
          author_name_string: name,
          user_id: userId,
          author_order: order,
        })),
      });
    }
    return byline;
  }

  private assertExpectedArticleRevision(
    release: ArticleRelease,
    expectedRevisionId: string,
  ): void {
    if (release.id !== expectedRevisionId.toLowerCase()) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputRevisionLocked,
        HttpStatus.CONFLICT,
      );
    }
  }

  async updateArticleAbstract(
    outputId: string,
    callerId: string,
    dto: UpdateArticleAbstractDto,
  ): Promise<OutputRevisionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const release = await this.lockArticleRelease(tx, outputId, callerId);
      this.assertExpectedArticleRevision(release, dto.expectedRevisionId);
      if (release.abstract === dto.abstract)
        return this.mapToRevisionResponse(release);

      const revisionId = await this.copyArticleRevision(tx, release, callerId, {
        metadata: { abstract: dto.abstract },
      });
      await this.releaseRevision(tx, {
        outputId: release.output_id,
        revisionId,
        callerId,
      });
      const revision = await tx.output_revisions.findUniqueOrThrow({
        where: { id: revisionId },
      });
      return this.mapToRevisionResponse(revision);
    });
  }

  async attachArticlePdf(
    outputId: string,
    callerId: string,
    dto: AttachArticlePdfDto,
  ): Promise<AttachArticlePdfResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const release = await this.lockArticleRelease(tx, outputId, callerId);
      this.assertExpectedArticleRevision(release, dto.expectedRevisionId);

      const replacedFileId = dto.replaceFileId?.toLowerCase();
      if (replacedFileId) {
        this.assertCurrentArticlePdf(release, replacedFileId);
      } else if (this.currentArticlePdfIds(release).length > 0) {
        throw new CodedHttpException(
          domainErrorCodes.storage.fileConflict,
          HttpStatus.CONFLICT,
        );
      }

      const revisionId = await this.copyArticleRevision(tx, release, callerId, {
        removedFileId: replacedFileId,
      });
      const file = await this.articleUploads.consumeVerifiedUpload(
        tx,
        callerId,
        dto.uploadId,
        release.output_id,
        revisionId,
        dto.fileVisibility,
      );
      await this.releaseRevision(tx, {
        outputId: release.output_id,
        revisionId,
        callerId,
        // No `sharing`: the Article is already shared and stays shared.
      });
      return { revisionId, fileId: file.id };
    });
  }

  async updateArticlePdfVisibility(
    outputId: string,
    callerId: string,
    fileId: string,
    dto: UpdateArticlePdfVisibilityDto,
  ): Promise<OutputFileResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const release = await this.lockArticleRelease(tx, outputId, callerId);
      this.assertCurrentArticlePdf(release, fileId.toLowerCase());
      const [previous] = await tx.$queryRaw<{ visibility: string }[]>`
        SELECT visibility::text AS visibility FROM output_files
        WHERE id = ${fileId}::uuid FOR UPDATE
      `;
      const file = await tx.output_files.update({
        where: { id: fileId },
        data: { visibility: dto.fileVisibility, access_group_id: null },
      });
      if (
        previous?.visibility === 'PRIVATE' &&
        dto.fileVisibility !== 'PRIVATE'
      ) {
        // Access granted while the file was Private must not come back if
        // the owner makes it Private again later.
        await this.closeFileAccess(tx, {
          fileId: file.id,
          outputId: release.output_id,
          callerId,
          reason: 'FILE_NOT_PRIVATE',
          action: 'output_file.left_private',
        });
      }
      return this.mapToFileResponse({
        ...file,
        is_current_release_attachment: true,
      });
    });
  }

  async removeArticlePdf(
    outputId: string,
    callerId: string,
    fileId: string,
  ): Promise<ArticlePdfRevisionResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const release = await this.lockArticleRelease(tx, outputId, callerId);
      const removedFileId = fileId.toLowerCase();
      this.assertCurrentArticlePdf(release, removedFileId);
      const revisionId = await this.copyArticleRevision(tx, release, callerId, {
        removedFileId,
      });
      await this.releaseRevision(tx, {
        outputId: release.output_id,
        revisionId,
        callerId,
        // No `sharing`: the Article is already shared and stays shared.
      });
      return { revisionId };
    });
  }

  private async lockArticleRelease(
    tx: Prisma.TransactionClient,
    outputId: string,
    callerId: string,
  ): Promise<ArticleRelease> {
    // Serialize mutations of the current release and its file policy on the
    // output row. A concurrent caller sees the winning edit's new release.
    const [output] = await tx.$queryRaw<
      (Pick<
        ResearchOutput,
        'owner_id' | 'sharing_status' | 'current_release_id'
      > & {
        researcher: boolean;
      })[]
    >`
      SELECT owner_id, sharing_status, current_release_id,
             is_researcher(${callerId}::uuid) AS researcher
      FROM research_outputs
      WHERE id = ${outputId}::uuid
      FOR NO KEY UPDATE
    `;
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
    if (!output.researcher) {
      throw new CodedHttpException(
        domainErrorCodes.identity.researcherRequired,
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      output.sharing_status !== OutputSharingStatus.SHARED ||
      !output.current_release_id
    ) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputRevisionLocked,
        HttpStatus.CONFLICT,
      );
    }

    const release = await tx.output_revisions.findUniqueOrThrow({
      where: { id: output.current_release_id },
      include: {
        output_revision_files: {
          include: {
            output_files: { select: { mime_type: true, is_available: true } },
          },
        },
      },
    });
    if (release.output_type !== OutputType.ARTICLE) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputRevisionLocked,
        HttpStatus.CONFLICT,
      );
    }
    return release;
  }

  private currentArticlePdfIds(release: ArticleRelease): string[] {
    return release.output_revision_files
      .filter(
        ({ output_files: file }) =>
          file.is_available &&
          file.mime_type.toLowerCase() === 'application/pdf',
      )
      .map(({ file_id }) => file_id);
  }

  private assertCurrentArticlePdf(
    release: ArticleRelease,
    fileId: string,
  ): void {
    if (!this.currentArticlePdfIds(release).includes(fileId)) {
      throw new CodedHttpException(
        domainErrorCodes.storage.fileNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * Ends file access requests and grants for a file that can no longer be
   * requested (RES-176): pending requests are cancelled, active grants are
   * revoked, and one audit entry records the change even when nothing was
   * pending. Runs inside the caller's transaction, after the Article lock.
   */
  private async closeFileAccess(
    tx: Prisma.TransactionClient,
    {
      fileId,
      outputId,
      callerId,
      reason,
      action,
    }: {
      fileId: string;
      outputId: string;
      callerId: string;
      reason: 'FILE_UNAVAILABLE' | 'FILE_NOT_PRIVATE';
      action: 'output_file.unavailable' | 'output_file.left_private';
    },
  ): Promise<void> {
    const cancelled = await tx.$queryRaw<{ id: string }[]>`
      UPDATE file_access_requests
      SET status = 'CANCELLED', cancel_reason = ${reason},
          decided_by = ${callerId}::uuid, decided_at = clock_timestamp()
      WHERE file_id = ${fileId}::uuid AND status = 'PENDING'
      RETURNING id
    `;
    const revoked = await tx.$queryRaw<{ id: string }[]>`
      UPDATE file_access_grants
      SET revoked_by = ${callerId}::uuid, revoked_at = clock_timestamp()
      WHERE file_id = ${fileId}::uuid AND revoked_at IS NULL
      RETURNING id
    `;
    await tx.auditLog.create({
      data: {
        actorId: callerId,
        action,
        entity: 'output_file',
        entityId: fileId,
        payload: {
          outputId,
          cancelledRequestIds: cancelled.map(({ id }) => id),
          revokedGrantIds: revoked.map(({ id }) => id),
        },
      },
    });
  }

  private async copyArticleRevision(
    tx: Prisma.TransactionClient,
    release: ArticleRelease,
    callerId: string,
    {
      metadata,
      removedFileId,
      topicIds,
    }: {
      metadata?: Partial<
        Pick<
          Prisma.output_revisionsUncheckedCreateInput,
          | 'title'
          | 'abstract'
          | 'venue'
          | 'volume'
          | 'issue'
          | 'pages'
          | 'peer_reviewed'
          | 'publication_date'
          | 'publication_year'
          | 'authors_snapshot'
        >
      >;
      removedFileId?: string;
      topicIds?: string[];
    },
  ): Promise<string> {
    const outputId = release.output_id;
    const [revisions] = await tx.$queryRaw<
      { latest: number; has_draft: boolean }[]
    >`
      SELECT max(revision_no) AS latest, bool_or(released_at IS NULL) AS has_draft
      FROM output_revisions
      WHERE output_id = ${outputId}::uuid
    `;
    if (revisions.has_draft) {
      throw new CodedHttpException(
        domainErrorCodes.outputs.outputRevisionLocked,
        HttpStatus.CONFLICT,
      );
    }
    const revision = await tx.output_revisions.create({
      data: {
        output_id: outputId,
        revision_no: revisions.latest + 1,
        created_by: callerId,
        title: release.title,
        abstract: release.abstract,
        venue: release.venue,
        publisher: release.publisher,
        publication_year: release.publication_year,
        publication_date: release.publication_date,
        publication_status: release.publication_status,
        output_type: release.output_type,
        volume: release.volume,
        issue: release.issue,
        pages: release.pages,
        peer_reviewed: release.peer_reviewed,
        external_url: release.external_url,
        authors_snapshot: release.authors_snapshot ?? Prisma.JsonNull,
        ...metadata,
      },
      select: { id: true },
    });

    const attachments = release.output_revision_files
      .filter(
        ({ file_id, output_files }) =>
          file_id !== removedFileId && output_files.is_available,
      )
      .map(({ file_id }) => ({
        file_id,
        output_id: outputId,
        revision_id: revision.id,
      }));
    if (attachments.length > 0) {
      await tx.output_revision_files.createMany({ data: attachments });
    }

    await tx.$executeRaw`
      INSERT INTO output_topics (output_id, revision_id, topic_id, added_by, created_at)
      SELECT output_id, ${revision.id}::uuid, topic_id, added_by, created_at
      FROM output_topics
      WHERE revision_id = ${release.id}::uuid
        ${
          topicIds === undefined
            ? Prisma.empty
            : topicIds.length
              ? Prisma.sql`AND topic_id IN (${Prisma.join(topicIds.map((id) => Prisma.sql`${id}::uuid`))})`
              : Prisma.sql`AND FALSE`
        }
    `;
    if (topicIds?.length) {
      await tx.output_topics.createMany({
        data: topicIds.map((topicId) => ({
          output_id: outputId,
          revision_id: revision.id,
          topic_id: topicId,
          added_by: callerId,
        })),
        skipDuplicates: true,
      });
    }
    if (removedFileId) {
      // Old revision links remain intact. The shared download policy checks
      // file availability, including when a group points to an older release.
      const [file] = await tx.$queryRaw<{ id: string }[]>`
        UPDATE output_files SET is_available = false
        WHERE id = ${removedFileId}::uuid AND is_available
        RETURNING id
      `;
      if (file) {
        await this.closeFileAccess(tx, {
          fileId: removedFileId,
          outputId: release.output_id,
          callerId,
          reason: 'FILE_UNAVAILABLE',
          action: 'output_file.unavailable',
        });
      }
    }
    return revision.id;
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
    if (dto.publicationDate !== undefined) {
      const date = normalizePublicationDate(dto.publicationDate);
      const year = Number(date.slice(0, 4));
      if (dto.publicationYear !== undefined && dto.publicationYear !== year) {
        throw new BadRequestException({
          message: { publicationYear: ['publication_year_date_mismatch'] },
        });
      }
      data['publication_date'] = date;
      data['publication_year'] = year;
    } else if (dto.publicationYear !== undefined) {
      if (
        draft.publication_date &&
        dto.publicationYear !== draft.publication_year
      ) {
        throw new BadRequestException({
          message: { publicationDate: ['publication_date_required'] },
        });
      }
      data['publication_year'] = dto.publicationYear;
    }
    if (dto.externalUrl !== undefined) {
      data['external_url'] = dto.externalUrl;
    }
    if (dto.outputType !== undefined) {
      const type = dto.outputType.trim();
      const normalizedType = type.toUpperCase();
      if (normalizedType === 'PAPER') {
        throw new BadRequestException({
          message: { outputType: ['article_type_invalid'] },
        });
      }
      data['output_type'] =
        normalizedType === OutputType.ARTICLE ? OutputType.ARTICLE : type;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.output_revisions.update({
        where: { id: draft.id },
        data,
      });

      // Lock every corrected field against the next sync. The provenance
      // writer is the only path that sets `is_locked`, so this is the only
      // place the lock can come from.
      for (const fieldName of EDITABLE_PROVENANCE_FIELDS) {
        if (data[fieldName] === undefined) {
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
   * This is the single publish action, whether the draft came from an
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
   * The audience follows the scope of the work. A personal work is
   * published to the community. A container work is published to its
   * container, or to the community - but only the container leads may
   * widen it, so the publish of a container work is the owner's request
   * and the leads settle it afterwards.
   *
   * The affiliation is checked separately: the caller has to be a member
   * of the group the work carries, so a work cannot be pointed at a group
   * the caller does not belong to. Affiliation grants no authority.
   */
  async publish(
    outputId: string,
    callerId: string,
    dto: PublishOutputDto,
  ): Promise<OutputResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize publication with OpenAlex acceptance so the byline includes
      // author links confirmed before we release the draft.
      const [output] = await tx.$queryRaw<
        Pick<
          ResearchOutput,
          'owner_id' | 'sharing_status' | 'scope_type' | 'scope_group_id'
        >[]
      >`
        SELECT owner_id, sharing_status, scope_type, scope_group_id
        FROM research_outputs
        WHERE id = ${outputId}::uuid
        FOR NO KEY UPDATE
      `;

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

      if (dto.accessGroupId) {
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

      const authorsSnapshot =
        draft.output_type === OutputType.ARTICLE
          ? completeArticleByline(
              draft.authors_snapshot,
              await tx.output_authors.findMany({
                where: { output_id: outputId },
                orderBy: { author_order: 'asc' },
              }),
            )
          : undefined;

      await this.releaseRevision(tx, {
        outputId,
        revisionId: draft.id,
        callerId,
        sharing: {
          audience: this.publishAudience(output.scope_type, dto.audience),
          accessGroupId: dto.accessGroupId ?? null,
        },
        authorsSnapshot,
      });
      return this.loadResponse(tx, outputId);
    });
  }

  /**
   * The audience a publish actually writes.
   *
   * A personal work has no container, so it publishes to the community.
   * A container work keeps its container unless the caller asked for the
   * community - and then only if the caller may widen it. The database
   * enforces the same rule through `can_set_output_audience`, so this
   * only narrows what a caller can ask for up front.
   */
  private publishAudience(
    scopeType: OutputScopeType,
    requested: OutputAudience,
  ): OutputAudience {
    if (scopeType === OutputScopeType.PERSONAL) {
      return OutputAudience.FPTU_COMMUNITY;
    }
    return requested === OutputAudience.FPTU_COMMUNITY
      ? OutputAudience.FPTU_COMMUNITY
      : OutputAudience.CONTAINER;
  }

  private async releaseRevision(
    tx: Prisma.TransactionClient,
    {
      outputId,
      revisionId,
      callerId,
      sharing,
      authorsSnapshot,
    }: {
      outputId: string;
      revisionId: string;
      callerId: string;
      /**
       * How the release affects the output's sharing columns.
       *
       * `sharing` is optional, and omitting it means "release the revision
       * without touching the sharing columns". The PDF edit endpoints
       * (`attachArticlePdf`, `removeArticlePdf`) rely on that: the output is
       * already SHARED, so re-stamping `first_shared_at` would reset the
       * shared-since date and trip the `guard_output_release` trigger, which
       * rejects a change to `first_shared_at` on an already-shared output.
       *
       * Pass `sharing` to also publish the output. `createArticle` passes it
       * because it creates the first release; the draft edit path passes it
       * because it publishes a draft.
       *
       * Omitting `sharing` by mistake releases a revision without sharing it,
       * and the database will not complain: `guard_output_release` only
       * checks that `current_release_id` points at a released revision. Pass
       * `sharing` deliberately.
       */
      sharing?: {
        audience: OutputAudience;
        accessGroupId: string | null;
      };
      authorsSnapshot?: Prisma.InputJsonArray;
    },
  ): Promise<void> {
    const now = await this.now(tx);
    // The database requires a released revision before it can pin and share it.
    await tx.output_revisions.update({
      where: { id: revisionId },
      data: {
        released_at: now,
        released_by: callerId,
        ...(authorsSnapshot === undefined
          ? {}
          : { authors_snapshot: authorsSnapshot }),
      },
    });
    await tx.research_outputs.update({
      where: { id: outputId },
      data: {
        current_release_id: revisionId,
        ...(sharing && {
          sharing_status: OutputSharingStatus.SHARED,
          first_shared_at: now,
          audience: sharing.audience,
          access_group_id: sharing.accessGroupId,
        }),
      },
    });
  }

  /**
   * Changes the audience of a shared work.
   *
   * The authority follows the scope, and the database decides it: the
   * owner of a personal work, the leads of the group of a group work, or
   * the project lead and the parent group leads of a project work. The
   * poster of a container work may not - the container owns the post.
   *
   * The scope is fixed, so the affiliation stays where it is. Only the
   * audience moves, and only to a layer that the scope allows.
   */
  async updateVisibility(
    outputId: string,
    callerId: string,
    dto: UpdateOutputVisibilityDto,
  ): Promise<OutputResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const output = await tx.research_outputs.findUnique({
        where: { id: outputId },
        select: {
          id: true,
          sharing_status: true,
          scope_type: true,
        },
      });

      if (!output) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotFound,
          HttpStatus.NOT_FOUND,
        );
      }

      if (output.sharing_status !== OutputSharingStatus.SHARED) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputNotArchived,
          HttpStatus.CONFLICT,
        );
      }

      const [allowed] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT can_set_output_audience(
          ${callerId}::uuid,
          ${outputId}::uuid,
          ${dto.audience}::output_audience
        ) AS allowed
      `;
      if (!allowed?.allowed) {
        throw new CodedHttpException(
          domainErrorCodes.outputs.outputAccessDenied,
          HttpStatus.FORBIDDEN,
        );
      }

      await tx.research_outputs.update({
        where: { id: outputId },
        data: {
          audience: dto.audience,
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

    const outputTopics = revision
      ? await tx.output_topics.findMany({
          where: { revision_id: revision.id },
          include: {
            research_topics: {
              include: {
                research_subfields: { include: { research_fields: true } },
              },
            },
          },
        })
      : [];

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
    output: ResearchOutput,
    revision: OutputRevision | null,
    authors: OutputAuthor[],
    topics: OutputTopicResponseDto[],
    canChangeVisibility = false,
  ): OutputResponseDto {
    // Older releases may have no byline snapshot. Keep their authors readable.
    const byline =
      revision?.released_at && revision.output_type === OutputType.ARTICLE
        ? readArticleByline(revision)
        : [];
    return {
      id: output.id,
      doi: output.doi ?? null,
      ownerId: output.owner_id ?? null,
      sharingStatus: output.sharing_status,
      scopeType: output.scope_type,
      scopeGroupId: output.scope_group_id ?? null,
      scopeProjectId: output.scope_project_id ?? null,
      audience: output.audience,
      canChangeVisibility,
      accessGroupId: output.access_group_id ?? null,
      importState: output.import_state,
      currentReleaseId: output.current_release_id ?? null,
      firstSharedAt: output.first_shared_at?.toISOString() ?? null,
      currentRevision: revision ? this.mapToRevisionResponse(revision) : null,
      authors: byline.length
        ? byline
        : authors.map((a) => this.mapToAuthorResponse(a)),
      topics,
    };
  }

  private mapToRevisionResponse(r: OutputRevision): OutputRevisionResponseDto {
    return {
      id: r.id,
      outputId: r.output_id,
      revisionNo: r.revision_no,
      title: r.title,
      abstract: r.abstract ?? null,
      venue: r.venue ?? null,
      publisher: r.publisher ?? null,
      publicationYear: r.publication_year ?? null,
      publicationDate:
        r.publication_date ?? r.publication_year?.toString() ?? null,
      publicationStatus: r.publication_status,
      outputType: r.output_type,
      volume: r.volume ?? null,
      issue: r.issue ?? null,
      pages: r.pages ?? null,
      peerReviewed: r.peer_reviewed ?? null,
      externalUrl: r.external_url ?? null,
      releasedAt: r.released_at ? r.released_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
    };
  }

  private mapToAuthorResponse(a: OutputAuthor): OutputAuthorResponseDto {
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
