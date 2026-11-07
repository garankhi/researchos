import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { describe, expect, it, vi } from 'vitest';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { TaxonomySource } from './dto/taxonomy-source.enum.js';
import { TaxonomyController } from './taxonomy.controller.js';
import { TaxonomyService } from './taxonomy.service.js';

describe('TaxonomyController', () => {
  const mockField = {
    id: '11111111-1111-1111-1111-111111111111',
    internal_code: 'FIELD-CS',
    name: 'Computer Science',
    name_vi: 'Khoa học máy tính',
    description: 'Field description',
    source: 'OPENALEX',
    external_id: 'https://openalex.org/fields/17',
    is_active: true,
  };

  const mockSubfield = {
    id: '22222222-2222-2222-2222-222222222222',
    field_id: '11111111-1111-1111-1111-111111111111',
    internal_code: 'SUBFIELD-AI',
    name: 'Artificial Intelligence',
    name_vi: 'Trí tuệ nhân tạo',
    description: 'Subfield description',
    source: 'OPENALEX',
    external_id: 'https://openalex.org/subfields/1702',
    is_active: true,
  };

  const mockTopic = {
    id: '33333333-3333-3333-3333-333333333333',
    subfield_id: '22222222-2222-2222-2222-222222222222',
    name: 'Deep Learning',
    description: 'Topic description',
    source: 'OPENALEX',
    external_id: 'https://openalex.org/topics/T10001',
    is_active: true,
  };

  const createPrismaMock = () => ({
    research_fields: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    research_subfields: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    research_topics: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  });

  const setupController = async (
    prismaMock: ReturnType<typeof createPrismaMock>,
  ) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TaxonomyController],
      providers: [
        TaxonomyService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    return moduleRef.get<TaxonomyController>(TaxonomyController);
  };

  describe('getTree', () => {
    it('returns the full tree hierarchy', async () => {
      const prismaMock = createPrismaMock();
      const treeField = {
        ...mockField,
        research_subfields: [
          {
            ...mockSubfield,
            research_topics: [mockTopic],
          },
        ],
      };
      prismaMock.research_fields.findMany.mockResolvedValue([treeField]);

      const controller = await setupController(prismaMock);
      const result = await controller.getTree({ isActive: true });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockField.id);
      expect(result[0].internalCode).toBe(mockField.internal_code);
      expect(result[0].subfields).toHaveLength(1);
      expect(result[0].subfields[0].id).toBe(mockSubfield.id);
      expect(result[0].subfields[0].topics).toHaveLength(1);
      expect(result[0].subfields[0].topics[0].id).toBe(mockTopic.id);
      expect(result[0].subfields[0].topics[0].name).toBe('Deep Learning');
    });

    it('retains OPENALEX parent field and subfield when filtering source=LOCAL', async () => {
      const prismaMock = createPrismaMock();
      const localTopic = {
        ...mockTopic,
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Custom Local Topic',
        source: 'LOCAL',
        external_id: null,
      };
      const emptySubfield = {
        ...mockSubfield,
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Empty Subfield',
        research_topics: [],
      };
      const treeFieldWithLocalTopic = {
        ...mockField,
        research_subfields: [
          {
            ...mockSubfield,
            research_topics: [localTopic],
          },
          emptySubfield,
        ],
      };
      const emptyField = {
        ...mockField,
        id: '66666666-6666-6666-6666-666666666666',
        name: 'Empty Field',
        research_subfields: [emptySubfield],
      };
      prismaMock.research_fields.findMany.mockResolvedValue([
        treeFieldWithLocalTopic,
        emptyField,
      ]);

      const controller = await setupController(prismaMock);
      const result = await controller.getTree({
        source: TaxonomySource.LOCAL,
        isActive: true,
      });

      expect(prismaMock.research_fields.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { is_active: true },
          include: expect.objectContaining({
            research_subfields: expect.objectContaining({
              where: { is_active: true },
              include: expect.objectContaining({
                research_topics: expect.objectContaining({
                  where: { is_active: true, source: TaxonomySource.LOCAL },
                }),
              }),
            }),
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockField.id);
      expect(result[0].subfields).toHaveLength(1);
      expect(result[0].subfields[0].id).toBe(mockSubfield.id);
      expect(result[0].subfields[0].topics).toHaveLength(1);
      expect(result[0].subfields[0].topics[0].source).toBe(
        TaxonomySource.LOCAL,
      );
    });
  });

  describe('findAllFields', () => {
    it('returns a list of field response DTOs', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_fields.findMany.mockResolvedValue([mockField]);

      const controller = await setupController(prismaMock);
      const result = await controller.findAllFields({ isActive: true });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockField.id);
      expect(result[0].name).toBe('Computer Science');
      expect(result[0].source).toBe(TaxonomySource.OPENALEX);
    });
  });

  describe('findSubfieldsByFieldId', () => {
    it('returns subfields when field exists', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_fields.findUnique.mockResolvedValue(mockField);
      prismaMock.research_subfields.findMany.mockResolvedValue([mockSubfield]);

      const controller = await setupController(prismaMock);
      const result = await controller.findSubfieldsByFieldId(mockField.id, {
        isActive: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockSubfield.id);
      expect(result[0].fieldId).toBe(mockField.id);
      expect(result[0].name).toBe('Artificial Intelligence');
    });

    it('throws CodedHttpException fieldNotFound when field does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_fields.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(
        controller.findSubfieldsByFieldId('non-existent-id', {}),
      ).rejects.toThrow(
        new CodedHttpException(
          domainErrorCodes.taxonomy.fieldNotFound,
          HttpStatus.NOT_FOUND,
        ),
      );
    });
  });

  describe('findAllTopics', () => {
    it('returns paginated topics with pagination metadata', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([mockTopic]);
      prismaMock.research_topics.count.mockResolvedValue(1);

      const controller = await setupController(prismaMock);
      const result = await controller.findAllTopics({
        page: 1,
        limit: 20,
        search: 'Deep',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(mockTopic.id);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNextPage).toBe(false);
    });

    it('honors sort parameter and rejects unknown sort keys with 400', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findMany.mockResolvedValue([mockTopic]);
      prismaMock.research_topics.count.mockResolvedValue(1);

      const controller = await setupController(prismaMock);
      await controller.findAllTopics({
        page: 1,
        limit: 20,
        sort: '-name',
      });

      expect(prismaMock.research_topics.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'desc' },
        }),
      );

      await expect(
        controller.findAllTopics({
          page: 1,
          limit: 20,
          sort: 'invalidField',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOneTopic', () => {
    it('returns topic detail with parent subfield and root field', async () => {
      const prismaMock = createPrismaMock();
      const detailedTopic = {
        ...mockTopic,
        research_subfields: {
          ...mockSubfield,
          research_fields: mockField,
        },
      };
      prismaMock.research_topics.findUnique.mockResolvedValue(detailedTopic);

      const controller = await setupController(prismaMock);
      const result = await controller.findOneTopic(mockTopic.id);

      expect(result.id).toBe(mockTopic.id);
      expect(result.name).toBe('Deep Learning');
      expect(result.subfield.id).toBe(mockSubfield.id);
      expect(result.subfield.name).toBe('Artificial Intelligence');
      expect(result.field.id).toBe(mockField.id);
      expect(result.field.name).toBe('Computer Science');
    });

    it('throws CodedHttpException topicNotFound when topic does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_topics.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock);

      await expect(controller.findOneTopic('non-existent-id')).rejects.toThrow(
        new CodedHttpException(
          domainErrorCodes.taxonomy.topicNotFound,
          HttpStatus.NOT_FOUND,
        ),
      );
    });
  });
});
