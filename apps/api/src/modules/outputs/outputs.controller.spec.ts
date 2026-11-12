import { BadRequestException, HttpStatus } from '@nestjs/common';
import { domainErrorCodes } from '@researchos/error-codes';
import { Test } from '@nestjs/testing';
import {
  OutputFileVisibility,
  OutputImportState,
  OutputSharingStatus,
  PrismaService,
  PublicationStatusEnum,
} from '@researchos/database';
import { describe, expect, it, vi } from 'vitest';
import { ListOutputsQueryDto } from './dto/list-outputs-query.dto.js';
import { OutputsController } from './outputs.controller.js';
import { OutputsService } from './outputs.service.js';

describe('OutputsController & OutputsService', () => {
  const callerId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const outputId = '33333333-3333-4333-8333-333333333333';
  const pinnedRevId = '44444444-4444-4444-8444-444444444444';
  const groupId = '55555555-5555-4555-8555-555555555555';
  const fileId = '66666666-6666-4666-8666-666666666666';

  const mockSharedOutput = {
    id: outputId,
    doi: '10.1234/test.2026',
    owner_id: otherUserId,
    created_by: otherUserId,
    sharing_status: OutputSharingStatus.SHARED,
    current_release_id: pinnedRevId,
    visibility: OutputFileVisibility.FPTU_COMMUNITY,
    access_group_id: null,
    provenance_tag: 'PAPER',
    import_state: OutputImportState.ACCEPTED,
    last_synced_at: null,
    first_shared_at: new Date('2026-11-11T00:00:00.000Z'),
    archived_at: null,
    created_at: new Date('2026-11-10T12:00:00.000Z'),
    updated_at: new Date('2026-11-11T00:00:00.000Z'),
    output_authors: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        output_id: outputId,
        user_id: otherUserId,
        author_name_string: 'Prof. Author',
        author_order: 1,
        is_corresponding_author: true,
      },
    ],
  };

  const mockPinnedRevision = {
    id: pinnedRevId,
    output_id: outputId,
    revision_no: 1,
    title: 'Pinned Research Publication',
    abstract: 'Abstract of the pinned publication',
    venue: 'Journal of Software',
    publisher: 'FPT Press',
    publication_year: 2026,
    publication_status: PublicationStatusEnum.PUBLISHED,
    output_type: 'PAPER',
    external_url: 'https://doi.org/10.1234/test.2026',
    authors_snapshot: [],
    created_by: otherUserId,
    released_by: otherUserId,
    released_at: new Date('2026-11-11T00:00:00.000Z'),
    created_at: new Date('2026-11-10T12:00:00.000Z'),
    updated_at: new Date('2026-11-11T00:00:00.000Z'),
  };

  const mockOutputTopics = [
    {
      output_id: outputId,
      revision_id: pinnedRevId,
      topic_id: '88888888-8888-4888-8888-888888888888',
      added_by: otherUserId,
      created_at: new Date('2026-11-10T12:00:00.000Z'),
      research_topics: {
        id: '88888888-8888-4888-8888-888888888888',
        name: 'Machine Learning',
        research_subfields: {
          id: '99999999-9999-4999-8999-999999999999',
          name: 'Artificial Intelligence',
          research_fields: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            name: 'Computer Science',
          },
        },
      },
    },
  ];

  const createTxMock = () => ({
    $queryRaw: vi.fn(),
  });

  const createPrismaMock = (tx = createTxMock()) => ({
    tx,
    $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
    $queryRaw: vi.fn(),
    research_outputs: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    output_revisions: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    output_topics: {
      findMany: vi.fn(),
    },
    output_authors: {
      findMany: vi.fn(),
    },
  });

  const setupController = async (
    prismaMock: ReturnType<typeof createPrismaMock>,
  ) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OutputsController],
      providers: [
        OutputsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    return {
      controller: moduleRef.get<OutputsController>(OutputsController),
      service: moduleRef.get<OutputsService>(OutputsService),
    };
  };

  describe('findAll', () => {
    it('returns a paginated list of visible outputs with pinned revisions, authors, and topics', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 1n }])
        .mockResolvedValueOnce([{ id: outputId }]);
      prismaMock.research_outputs.findMany.mockResolvedValue([
        mockSharedOutput,
      ]);
      prismaMock.output_revisions.findMany.mockResolvedValue([
        mockPinnedRevision,
      ]);
      prismaMock.output_topics.findMany.mockResolvedValue(mockOutputTopics);

      const { controller } = await setupController(prismaMock);
      const result = await controller.findAll(callerId, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: outputId,
          doi: '10.1234/test.2026',
          ownerId: otherUserId,
          sharingStatus: OutputSharingStatus.SHARED,
          currentReleaseId: pinnedRevId,
          currentRevision: expect.objectContaining({
            id: pinnedRevId,
            title: 'Pinned Research Publication',
            publicationYear: 2026,
          }),
          authors: [
            expect.objectContaining({
              authorNameString: 'Prof. Author',
              authorOrder: 1,
            }),
          ],
          topics: [
            expect.objectContaining({
              topicName: 'Machine Learning',
              subfieldName: 'Artificial Intelligence',
              fieldName: 'Computer Science',
            }),
          ],
        }),
      );
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('returns empty list and meta when no outputs match', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ total: 0n }]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.findAll(callerId, { page: 1, limit: 20 });

      expect(result).toEqual({
        items: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    });

    it('rejects invalid sort param with BadRequestException', async () => {
      const prismaMock = createPrismaMock();
      const { controller } = await setupController(prismaMock);

      await expect(
        controller.findAll(callerId, { sort: 'invalidSort' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('filters by author without dropping the visibility predicate', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 0n }])
        .mockResolvedValueOnce([]);

      const { controller } = await setupController(prismaMock);
      await controller.findAll(callerId, {
        page: 1,
        limit: 20,
        authorId: callerId,
      } as ListOutputsQueryDto);

      const sql = JSON.stringify(prismaMock.tx.$queryRaw.mock.calls[0][0]);
      // The author filter finds co-authored works the caller does not own;
      // `can_view_output` still decides which rows are visible at all.
      expect(sql).toContain('output_authors oa');
      expect(sql).toContain('can_view_output');
      expect(prismaMock.tx.$queryRaw.mock.calls[0][0].values).toContain(
        callerId,
      );
    });

    it('omits the author condition when the filter is absent', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ total: 0n }])
        .mockResolvedValueOnce([]);

      const { controller } = await setupController(prismaMock);
      await controller.findAll(callerId, { page: 1, limit: 20 });

      expect(
        JSON.stringify(prismaMock.tx.$queryRaw.mock.calls[0][0]),
      ).not.toContain('output_authors');
    });
  });

  describe('findOne', () => {
    it('returns 404 when output does not exist', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(null);

      const { controller } = await setupController(prismaMock);

      await expect(
        controller.findOne('00000000-0000-0000-0000-000000000000', callerId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: domainErrorCodes.outputs.outputNotFound,
      });
    });

    it('returns 403 when output exists but caller has no view permission', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(
        mockSharedOutput,
      );
      prismaMock.$queryRaw.mockResolvedValue([{ allowed: false }]);

      const { controller } = await setupController(prismaMock);

      await expect(
        controller.findOne(outputId, callerId),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.outputs.outputAccessDenied,
      });
    });

    it('returns 200 with pinned revision when caller is authorized', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(
        mockSharedOutput,
      );
      prismaMock.$queryRaw.mockResolvedValue([{ allowed: true }]);
      prismaMock.output_revisions.findUnique.mockResolvedValue(
        mockPinnedRevision,
      );
      prismaMock.output_topics.findMany.mockResolvedValue(mockOutputTopics);

      const { controller } = await setupController(prismaMock);
      const result = await controller.findOne(outputId, callerId);

      expect(result.id).toBe(outputId);
      expect(result.currentRevision?.id).toBe(pinnedRevId);
      expect(result.currentRevision?.title).toBe('Pinned Research Publication');
      expect(result.topics).toHaveLength(1);
    });

    it('resolves owner working copy draft revision when owner views their own unpublished DRAFT output', async () => {
      const draftOutput = {
        ...mockSharedOutput,
        owner_id: callerId,
        sharing_status: OutputSharingStatus.DRAFT,
        current_release_id: null,
      };

      const draftRev = {
        ...mockPinnedRevision,
        id: 'draft-rev-id',
        released_at: null,
        title: 'Owner Working Copy Draft',
      };

      const prismaMock = createPrismaMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(draftOutput);
      prismaMock.$queryRaw.mockResolvedValue([{ allowed: true }]);
      prismaMock.output_revisions.findFirst.mockResolvedValue(draftRev);
      prismaMock.output_topics.findMany.mockResolvedValue([]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.findOne(outputId, callerId);

      expect(result.currentReleaseId).toBeNull();
      expect(result.currentRevision?.title).toBe('Owner Working Copy Draft');
    });
  });

  describe('findRevisions', () => {
    it('returns 404 when output is missing', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(null);

      const { controller } = await setupController(prismaMock);

      await expect(
        controller.findRevisions(
          '00000000-0000-0000-0000-000000000000',
          callerId,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: domainErrorCodes.outputs.outputNotFound,
      });
    });

    it('returns 403 when caller is not allowed', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(
        mockSharedOutput,
      );
      prismaMock.$queryRaw.mockResolvedValue([{ allowed: false }]);

      const { controller } = await setupController(prismaMock);

      await expect(
        controller.findRevisions(outputId, callerId),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.outputs.outputAccessDenied,
      });
    });

    it('returns revisions ordered by revision number descending', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(
        mockSharedOutput,
      );
      prismaMock.$queryRaw.mockResolvedValue([{ allowed: true }]);
      prismaMock.output_revisions.findMany.mockResolvedValue([
        { ...mockPinnedRevision, revision_no: 2 },
        { ...mockPinnedRevision, id: 'rev-1', revision_no: 1 },
      ]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.findRevisions(outputId, callerId);

      expect(result).toHaveLength(2);
      expect(result[0].revisionNo).toBe(2);
      expect(result[1].revisionNo).toBe(1);
    });
  });

  describe('findFiles', () => {
    it('returns files visible to the caller via can_view_output_file', async () => {
      const prismaMock = createPrismaMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(
        mockSharedOutput,
      );
      prismaMock.$queryRaw
        .mockResolvedValueOnce([{ allowed: true }]) // assertCanViewOutput
        .mockResolvedValueOnce([
          {
            id: fileId,
            output_id: outputId,
            file_name: 'paper.pdf',
            mime_type: 'application/pdf',
            size_bytes: 2048n,
            sha256: 'hash123',
            visibility: OutputFileVisibility.FPTU_COMMUNITY,
            access_group_id: null,
            uploaded_at: new Date('2026-11-11T00:00:00.000Z'),
          },
        ]);

      const { controller } = await setupController(prismaMock);
      const result = await controller.findFiles(outputId, callerId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: fileId,
        outputId,
        fileName: 'paper.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        sha256: 'hash123',
        visibility: OutputFileVisibility.FPTU_COMMUNITY,
        accessGroupId: null,
        uploadedAt: '2026-11-11T00:00:00.000Z',
      });
    });
  });
});
