import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { buildPaginationMeta } from '../../common/dto/pagination.dto.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { FieldResponseDto } from './dto/field-response.dto.js';
import { ListFieldsQueryDto } from './dto/list-fields.query.dto.js';
import { ListSubfieldsQueryDto } from './dto/list-subfields.query.dto.js';
import { ListTopicsQueryDto } from './dto/list-topics.query.dto.js';
import { PaginatedTopicsResponseDto } from './dto/paginated-topics-response.dto.js';
import { SubfieldResponseDto } from './dto/subfield-response.dto.js';
import { TaxonomySource } from './dto/taxonomy-source.enum.js';
import {
  TaxonomyTreeFieldDto,
  TaxonomyTreeSubfieldDto,
  TaxonomyTreeTopicDto,
} from './dto/taxonomy-tree.dto.js';
import { TaxonomyTreeQueryDto } from './dto/taxonomy-tree.query.dto.js';
import { TopicDetailResponseDto } from './dto/topic-detail-response.dto.js';
import { TopicResponseDto } from './dto/topic-response.dto.js';

/**
 * Service providing read-only operations for the research taxonomy tree.
 *
 * All operations read from seeded PostgreSQL tables (`research_fields`,
 * `research_subfields`, `research_topics`). No external requests to OpenAlex
 * are performed at runtime.
 */
@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the complete 3-tier hierarchical taxonomy tree:
   * Fields -> Subfields -> Topics.
   */
  async getTree(query: TaxonomyTreeQueryDto): Promise<TaxonomyTreeFieldDto[]> {
    const whereNode: Record<string, unknown> = {};
    if (query.source) {
      whereNode.source = query.source;
    }
    if (query.isActive !== undefined) {
      whereNode.is_active = query.isActive;
    }

    const fields = await this.prisma.research_fields.findMany({
      where: whereNode,
      include: {
        research_subfields: {
          where: whereNode,
          include: {
            research_topics: {
              where: whereNode,
              orderBy: { name: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return fields.map((field) => this.toTreeField(field));
  }

  /**
   * Lists all research fields (Level 1).
   */
  async findAllFields(query: ListFieldsQueryDto): Promise<FieldResponseDto[]> {
    const where: Record<string, unknown> = {};
    if (query.source) {
      where.source = query.source;
    }
    if (query.isActive !== undefined) {
      where.is_active = query.isActive;
    }

    const fields = await this.prisma.research_fields.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return fields.map((f) => this.toFieldResponse(f));
  }

  /**
   * Lists research subfields (Level 2) belonging to a specific field.
   * Throws 404 (field_not_found) if the parent field does not exist.
   */
  async findSubfieldsByFieldId(
    fieldId: string,
    query: ListSubfieldsQueryDto,
  ): Promise<SubfieldResponseDto[]> {
    const field = await this.prisma.research_fields.findUnique({
      where: { id: fieldId },
    });

    if (!field) {
      throw new CodedHttpException(
        domainErrorCodes.taxonomy.fieldNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const where: Record<string, unknown> = {
      field_id: fieldId,
    };
    if (query.source) {
      where.source = query.source;
    }
    if (query.isActive !== undefined) {
      where.is_active = query.isActive;
    }

    const subfields = await this.prisma.research_subfields.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return subfields.map((s) => this.toSubfieldResponse(s));
  }

  /**
   * Searches and paginates research topics (Level 3).
   * Supports filtering by subfieldId, source, isActive, and topic name text matching.
   */
  async findAllTopics(
    query: ListTopicsQueryDto,
  ): Promise<PaginatedTopicsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.subfieldId) {
      where.subfield_id = query.subfieldId;
    }
    if (query.source) {
      where.source = query.source;
    }
    if (query.isActive !== undefined) {
      where.is_active = query.isActive;
    }
    if (query.search?.trim()) {
      where.name = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    const [topics, total] = await Promise.all([
      this.prisma.research_topics.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.research_topics.count({ where }),
    ]);

    const items = topics.map((t) => this.toTopicResponse(t));
    const meta = buildPaginationMeta({ page, limit }, topics.length, total);

    return { items, meta };
  }

  /**
   * Retrieves a single research topic with full parent hierarchy context.
   * Throws 404 (topic_not_found) if the topic does not exist.
   */
  async findOneTopic(topicId: string): Promise<TopicDetailResponseDto> {
    const topic = await this.prisma.research_topics.findUnique({
      where: { id: topicId },
      include: {
        research_subfields: {
          include: {
            research_fields: true,
          },
        },
      },
    });

    if (!topic) {
      throw new CodedHttpException(
        domainErrorCodes.taxonomy.topicNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const subfield = topic.research_subfields;
    const field = subfield.research_fields;

    return {
      ...this.toTopicResponse(topic),
      subfield: this.toSubfieldResponse(subfield),
      field: this.toFieldResponse(field),
    };
  }

  private toFieldResponse(f: any): FieldResponseDto {
    return {
      id: f.id,
      internalCode: f.internal_code ?? null,
      name: f.name,
      nameVi: f.name_vi ?? null,
      description: f.description ?? null,
      source: f.source as TaxonomySource,
      externalId: f.external_id ?? null,
      isActive: f.is_active,
    };
  }

  private toSubfieldResponse(s: any): SubfieldResponseDto {
    return {
      id: s.id,
      fieldId: s.field_id,
      internalCode: s.internal_code ?? null,
      name: s.name,
      nameVi: s.name_vi ?? null,
      description: s.description ?? null,
      source: s.source as TaxonomySource,
      externalId: s.external_id ?? null,
      isActive: s.is_active,
    };
  }

  private toTopicResponse(t: any): TopicResponseDto {
    return {
      id: t.id,
      subfieldId: t.subfield_id,
      name: t.name,
      description: t.description ?? null,
      source: t.source as TaxonomySource,
      externalId: t.external_id ?? null,
      isActive: t.is_active,
    };
  }

  private toTreeTopic(t: any): TaxonomyTreeTopicDto {
    return {
      id: t.id,
      subfieldId: t.subfield_id,
      name: t.name,
      description: t.description ?? null,
      source: t.source as TaxonomySource,
      externalId: t.external_id ?? null,
      isActive: t.is_active,
    };
  }

  private toTreeSubfield(s: any): TaxonomyTreeSubfieldDto {
    return {
      id: s.id,
      fieldId: s.field_id,
      internalCode: s.internal_code ?? null,
      name: s.name,
      nameVi: s.name_vi ?? null,
      description: s.description ?? null,
      source: s.source as TaxonomySource,
      externalId: s.external_id ?? null,
      isActive: s.is_active,
      topics: (s.research_topics ?? []).map((t: any) => this.toTreeTopic(t)),
    };
  }

  private toTreeField(f: any): TaxonomyTreeFieldDto {
    return {
      id: f.id,
      internalCode: f.internal_code ?? null,
      name: f.name,
      nameVi: f.name_vi ?? null,
      description: f.description ?? null,
      source: f.source as TaxonomySource,
      externalId: f.external_id ?? null,
      isActive: f.is_active,
      subfields: (f.research_subfields ?? []).map((s: any) =>
        this.toTreeSubfield(s),
      ),
    };
  }
}
