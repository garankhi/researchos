import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  buildPaginationMeta,
  type PaginationQueryDto,
  parseSortParam,
} from '../../common/dto/pagination.dto.js';
import {
  type FollowDto,
  FollowEntityType,
  type FollowTargetDto,
  type PaginatedFollowsDto,
} from './follow.dto.js';

// Keep target eligibility identical for creation and for listing existing follows.
const visibleTarget = Prisma.sql`
  SELECT u.full_name AS display_name, p.availability_status::text AS state
  FROM researcher_profiles p
  JOIN users u ON u.id = p.user_id
  WHERE f.entity_type = 'RESEARCHER' AND p.user_id = f.entity_id
    AND p.profile_confirmed_at IS NOT NULL AND is_researcher(u.id)
  UNION ALL
  SELECT g.name, 'ACTIVE'
  FROM research_groups g
  WHERE f.entity_type = 'GROUP' AND g.id = f.entity_id
    AND g.is_active AND g.archived_at IS NULL
  UNION ALL
  SELECT t.name, 'ACTIVE'
  FROM research_topics t
  WHERE f.entity_type = 'TOPIC' AND t.id = f.entity_id AND t.is_active
`;

@Injectable()
export class FollowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(callerId: string, dto: FollowTargetDto): Promise<FollowDto> {
    const { entityType } = dto;
    const entityId = dto.entityId.toLowerCase();
    if (
      entityType === FollowEntityType.PROJECT ||
      entityType === FollowEntityType.OUTPUT
    ) {
      throw new CodedHttpException(
        domainErrorCodes.follows.targetTypeUnsupported,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      entityType === FollowEntityType.RESEARCHER &&
      entityId === callerId.toLowerCase()
    ) {
      throw new CodedHttpException(
        domainErrorCodes.follows.selfFollow,
        HttpStatus.BAD_REQUEST,
      );
    }

    const [result] = await this.prisma.$queryRaw<
      Array<{
        allowed: boolean;
        targetExists: boolean;
        followedAt: Date | null;
        displayName: string | null;
        state: string | null;
      }>
    >`
      WITH caller AS (
        SELECT is_researcher(${callerId}::uuid) AS allowed
      ), target AS (
        SELECT t.*
        FROM (VALUES (${entityType}::entity_types, ${entityId}::uuid))
          AS f(entity_type, entity_id)
        CROSS JOIN LATERAL (${visibleTarget}) t
      ), inserted AS (
        INSERT INTO user_follows (follower_id, entity_type, entity_id)
        SELECT ${callerId}::uuid, ${entityType}::entity_types, ${entityId}::uuid
        FROM caller CROSS JOIN target WHERE caller.allowed
        ON CONFLICT (follower_id, entity_type, entity_id) DO NOTHING
        RETURNING followed_at
      )
      SELECT caller.allowed, target.display_name IS NOT NULL AS "targetExists",
        inserted.followed_at AS "followedAt",
        target.display_name AS "displayName", target.state
      FROM caller LEFT JOIN target ON true LEFT JOIN inserted ON true
    `;
    if (!result.allowed)
      throw new CodedHttpException(
        domainErrorCodes.identity.researcherRequired,
        HttpStatus.FORBIDDEN,
      );
    if (!result.targetExists)
      throw new CodedHttpException(
        domainErrorCodes.follows.targetNotFound,
        HttpStatus.NOT_FOUND,
      );
    if (
      !result.followedAt ||
      result.displayName === null ||
      result.state === null
    ) {
      throw new CodedHttpException(
        domainErrorCodes.follows.alreadyFollowing,
        HttpStatus.CONFLICT,
      );
    }
    return {
      entityType,
      entityId,
      followedAt: result.followedAt.toISOString(),
      displayName: result.displayName,
      state: result.state,
    };
  }

  async findAll(
    callerId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedFollowsDto> {
    const sort = parseSortParam(
      query.sort,
      { followedAt: 'followed_at' },
      { followed_at: 'desc' },
    );
    if (!sort) throw new BadRequestException('validation_failed');
    const direction =
      sort.followed_at === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const order = Prisma.sql`"followedAt" ${direction}, "entityType", "entityId"`;
    const [result] = await this.prisma.$queryRaw<
      Array<{ items: FollowDto[]; total: number }>
    >`
      WITH visible AS (
        SELECT f.entity_type AS "entityType", f.entity_id AS "entityId",
          f.followed_at AS "followedAt", t.display_name AS "displayName", t.state
        FROM user_follows f
        CROSS JOIN LATERAL (${visibleTarget}) t
        WHERE f.follower_id = ${callerId}::uuid
      ), page AS (
        SELECT * FROM visible ORDER BY ${order}
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
      )
      SELECT (SELECT count(*)::int FROM visible) AS total,
        COALESCE(jsonb_agg(page ORDER BY ${order}), '[]'::jsonb) AS items
      FROM page
    `;
    const items = result.items.map(
      ({ entityType, entityId, followedAt, displayName, state }) => ({
        entityType,
        entityId,
        followedAt: new Date(followedAt).toISOString(),
        displayName,
        state,
      }),
    );
    return {
      items,
      meta: buildPaginationMeta(query, items.length, result.total),
    };
  }

  async remove(callerId: string, dto: FollowTargetDto): Promise<void> {
    await this.prisma.user_follows.deleteMany({
      where: {
        follower_id: callerId,
        entity_type: dto.entityType,
        entity_id: dto.entityId,
      },
    });
  }
}
