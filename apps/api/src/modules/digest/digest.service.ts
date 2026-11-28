import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import {
  buildPaginationMeta,
  parseSortParam,
  type PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import type {
  DigestDeliveryDetailDto,
  DigestDeliveryDto,
  DigestDeliveryPageDto,
  DigestItemDto,
  DigestPreferencesDto,
  UpdateDigestPreferencesDto,
} from './digest.dto.js';

const defaultPreferences = { language: 'vi' };

function preferencesDto(
  row: Prisma.digest_preferencesGetPayload<undefined>,
): DigestPreferencesDto {
  return {
    enabled: row.enabled,
    timezone: row.timezone,
    language: row.language,
    updatedAt: row.updated_at,
  };
}

function deliveryDto(row: Prisma.digest_deliveriesGetPayload<undefined>) {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    attempts: row.attempts,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  } satisfies DigestDeliveryDto;
}

@Injectable()
export class DigestService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string): Promise<DigestPreferencesDto> {
    const where = { user_id: userId };
    const existing = await this.prisma.digest_preferences.findUnique({ where });
    if (existing) return preferencesDto(existing);

    await this.prisma.digest_preferences.createMany({
      data: { ...where, ...defaultPreferences },
      skipDuplicates: true,
    });
    return preferencesDto(
      await this.prisma.digest_preferences.findUniqueOrThrow({ where }),
    );
  }

  async updatePreferences(
    userId: string,
    dto: UpdateDigestPreferencesDto,
  ): Promise<DigestPreferencesDto> {
    if (
      dto.enabled === undefined &&
      dto.timezone === undefined &&
      dto.language === undefined
    ) {
      return this.getPreferences(userId);
    }
    const updates = {
      enabled: dto.enabled,
      timezone: dto.timezone,
      language: dto.language,
      updated_at: new Date(),
    };
    return preferencesDto(
      await this.prisma.digest_preferences.upsert({
        where: { user_id: userId },
        create: {
          ...updates,
          user_id: userId,
          language: dto.language ?? defaultPreferences.language,
        },
        update: updates,
      }),
    );
  }

  async listDeliveries(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<DigestDeliveryPageDto> {
    const order = parseSortParam(
      query.sort,
      { periodEnd: 'period_end', createdAt: 'created_at' },
      { period_end: 'desc' },
    );
    if (!order) throw new BadRequestException();
    const where = { user_id: userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.digest_deliveries.findMany({
        where,
        orderBy: [order, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.digest_deliveries.count({ where }),
    ]);
    return {
      items: rows.map(deliveryDto),
      meta: buildPaginationMeta(query, rows.length, total),
    };
  }

  async getDelivery(
    userId: string,
    id: string,
  ): Promise<DigestDeliveryDetailDto> {
    const [row] = await this.prisma.$queryRaw<
      (Prisma.digest_deliveriesGetPayload<undefined> & {
        items: DigestItemDto[];
      })[]
    >`
      SELECT d.*, COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'subjectType', i.subject_type, 'subjectId', i.subject_id,
          'eventId', i.event_id, 'matchedReasons', i.matched_reasons,
          'contentSnapshot', i.content_snapshot
        ) ORDER BY i.subject_type, i.subject_id)
        FROM digest_items i
        WHERE i.delivery_id = d.id
          AND (d.status = 'SENT' OR (
            i.subject_type = 'OUTPUT' AND EXISTS (
              SELECT 1 FROM visible_output_releases(d.user_id) r WHERE r.output_id = i.subject_id
            )
          ))
      ), '[]'::jsonb) AS items
      FROM digest_deliveries d WHERE d.id = ${id}::uuid AND d.user_id = ${userId}::uuid
    `;
    if (!row) throw new NotFoundException();
    return { ...deliveryDto(row), items: row.items };
  }
}
