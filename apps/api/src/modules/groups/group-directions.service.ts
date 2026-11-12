import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import {
  buildPaginationMeta,
  PaginationQueryDto,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import { readDatabaseFailure } from '../../common/errors/database-errors.js';
import type {
  CreateGroupDirectionDto,
  UpdateGroupDirectionDto,
  GroupDirectionResponseDto,
} from './dto/group-direction.dto.js';

const include = {
  research_topics: {
    include: { research_subfields: { include: { research_fields: true } } },
  },
} as const;
type DirectionRow = Prisma.group_directionsGetPayload<{
  include: typeof include;
}>;

@Injectable()
export class GroupDirectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(
    tx: Prisma.TransactionClient,
    groupId: string,
    actorId: string,
    action: 'read' | 'publish' | 'edit',
  ) {
    // Use the same parent lock as membership and lead changes.
    await tx.$queryRaw`SELECT id FROM research_groups WHERE id = ${groupId}::uuid FOR SHARE`;
    const group = await tx.research_groups.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Group not found');
    const lead = group.lead_id === actorId.toLowerCase();
    const active = group.is_active && group.archived_at === null;
    if (action === 'read' && active) return;
    const member = await tx.group_members.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: actorId } },
    });
    if (action === 'read') {
      if (!lead && !member) throw new ForbiddenException();
      return;
    }
    if (!lead && !(action === 'publish' && member?.role === 'CORE_MEMBER'))
      throw new ForbiddenException();
    if (!active)
      throw new ConflictException(
        'Archived or inactive groups cannot publish or change directions',
      );
  }

  private async topic(
    tx: Prisma.TransactionClient,
    topicId: string | null | undefined,
  ) {
    if (!topicId) return;
    const topic = await tx.research_topics.findUnique({
      where: { id: topicId },
      select: { is_active: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    if (!topic.is_active) throw new BadRequestException('Topic is inactive');
  }

  private async run<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation);
    } catch (error) {
      const failure = readDatabaseFailure(error);
      if (failure?.prismaCode === 'P2025')
        throw new NotFoundException('Direction not found in this group');
      if (failure?.prismaCode === 'P2003' || failure?.sqlState === '23503')
        throw new ConflictException(
          'Direction is referenced by a project, or a related resource changed',
        );
      if (failure?.prismaCode === 'P2034')
        throw new ConflictException('Concurrent change; retry');
      throw error;
    }
  }

  async list(groupId: string, actorId: string, query: PaginationQueryDto) {
    const orderBy = parseSortParam(
      query.sort,
      { createdAt: 'created_at', title: 'title' },
      { created_at: 'desc' },
    );
    if (!orderBy)
      throw new BadRequestException('Unsupported direction sort field');
    return this.run(async (tx) => {
      await this.authorize(tx, groupId, actorId, 'read');
      const where = { group_id: groupId };
      const rows = await tx.group_directions.findMany({
        where,
        include,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const total = await tx.group_directions.count({ where });
      return {
        items: rows.map((row) => this.response(row)),
        meta: buildPaginationMeta(query, rows.length, total),
      };
    });
  }

  async create(
    groupId: string,
    actorId: string,
    dto: CreateGroupDirectionDto,
  ): Promise<GroupDirectionResponseDto> {
    return this.run(async (tx) => {
      await this.authorize(tx, groupId, actorId, 'publish');
      await this.topic(tx, dto.topicId);
      return this.response(
        await tx.group_directions.create({
          data: {
            group_id: groupId,
            topic_id: dto.topicId,
            title: dto.title,
            description: dto.description?.trim() || null,
          },
          include,
        }),
      );
    });
  }

  async update(
    groupId: string,
    directionId: string,
    actorId: string,
    dto: UpdateGroupDirectionDto,
  ): Promise<GroupDirectionResponseDto> {
    return this.run(async (tx) => {
      await this.authorize(tx, groupId, actorId, 'edit');
      const existing = await tx.group_directions.findUnique({
        where: { id_group_id: { id: directionId, group_id: groupId } },
      });
      if (!existing)
        throw new NotFoundException('Direction not found in this group');
      await this.topic(tx, dto.topicId);
      return this.response(
        await tx.group_directions.update({
          where: { id_group_id: { id: directionId, group_id: groupId } },
          data: {
            title: dto.title,
            topic_id: dto.topicId,
            description:
              dto.description === undefined
                ? undefined
                : dto.description?.trim() || null,
          },
          include,
        }),
      );
    });
  }

  async remove(
    groupId: string,
    directionId: string,
    actorId: string,
  ): Promise<void> {
    await this.run(async (tx) => {
      await this.authorize(tx, groupId, actorId, 'edit');
      await tx.group_directions.delete({
        where: { id_group_id: { id: directionId, group_id: groupId } },
      });
    });
  }

  private response(row: DirectionRow): GroupDirectionResponseDto {
    const topic = row.research_topics;
    const subfield = topic?.research_subfields;
    const field = subfield?.research_fields;
    return {
      id: row.id,
      groupId: row.group_id,
      topicId: row.topic_id,
      title: row.title,
      description: row.description,
      createdAt: row.created_at.toISOString(),
      topicPath:
        topic && subfield && field
          ? {
              topic: { id: topic.id, name: topic.name },
              subfield: { id: subfield.id, name: subfield.name },
              field: { id: field.id, name: field.name },
            }
          : null,
    };
  }
}
