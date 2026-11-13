import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import type { CreateInterestDto } from './dto/create-interest.dto.js';
import type { UpdateInterestDto } from './dto/update-interest.dto.js';
import type { InterestResponseDto } from './dto/interest-response.dto.js';

type InterestRow = Prisma.research_interestsGetPayload<Record<string, never>>;

@Injectable()
export class InterestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<InterestResponseDto[]> {
    const rows = await this.prisma.research_interests.findMany({
      where: { user_id: userId },
      orderBy: [{ declared_at: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async create(
    userId: string,
    dto: CreateInterestDto,
  ): Promise<InterestResponseDto> {
    await this.requireActiveTopic(dto.topicId);
    try {
      const row = await this.prisma.research_interests.create({
        data: {
          user_id: userId,
          topic_id: dto.topicId,
          source_type: 'DECLARED',
          status: 'ACTIVE',
          provenance_tag: 'HUMAN',
          reviewed_at: new Date(),
        },
      });
      return this.toResponse(row);
    } catch (error) {
      // Rely on the unique constraint so concurrent declarations also return 409.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An interest for this topic already exists.',
        );
      }
      throw error;
    }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateInterestDto,
  ): Promise<InterestResponseDto> {
    const row = await this.prisma.research_interests.findFirst({
      where: { id, user_id: userId },
    });
    if (!row) throw new NotFoundException('Interest not found.');
    if (dto.status === 'ACTIVE') await this.requireActiveTopic(row.topic_id);

    // Repeated decisions retain their original review time.
    if (row.status === dto.status) return this.toResponse(row);
    try {
      const updated = await this.prisma.research_interests.update({
        where: { id, user_id: userId },
        data: { status: dto.status, reviewed_at: new Date() },
      });
      return this.toResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Interest not found.');
      }
      throw error;
    }
  }

  private async requireActiveTopic(topicId: string): Promise<void> {
    const topic = await this.prisma.research_topics.findUnique({
      where: { id: topicId },
      select: { is_active: true },
    });
    if (!topic) throw new NotFoundException('Topic not found.');
    if (!topic.is_active) throw new BadRequestException('Topic is inactive.');
  }

  private toResponse(row: InterestRow): InterestResponseDto {
    return {
      id: row.id,
      userId: row.user_id,
      topicId: row.topic_id,
      sourceType: row.source_type,
      status: row.status,
      provenanceTag: row.provenance_tag,
      evidenceNote: row.evidence_note,
      declaredAt: row.declared_at.toISOString(),
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
    };
  }
}
