import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  OutputFileVisibility,
  OutputSharingStatus,
  PrismaService,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { describe, expect, it, vi } from 'vitest';
import { ProvenanceService } from '../provenance/provenance.service.js';
import { OutputsController } from './outputs.controller.js';
import { OutputsService } from './outputs.service.js';

/**
 * The three write paths on a research output.
 *
 * They are the shared core of every way a work reaches the public: the
 * OpenAlex accept flow ends at the same draft revision these start from,
 * and a work created inside the platform later will do the same.
 */
describe('OutputsController mutations', () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const outputId = '33333333-3333-4333-8333-333333333333';
  const draftRevId = '44444444-4444-4444-8444-444444444444';
  const groupId = '55555555-5555-4555-8555-555555555555';
  const now = new Date('2026-11-13T00:00:00.000Z');

  const mockDraftOutput = {
    id: outputId,
    owner_id: ownerId,
    sharing_status: OutputSharingStatus.DRAFT,
    current_release_id: null,
    first_shared_at: null,
    output_authors: [],
  };

  const mockDraftRevision = {
    id: draftRevId,
    output_id: outputId,
    revision_no: 1,
    title: 'Draft Title',
    abstract: null,
    venue: null,
    publisher: null,
    publication_year: null,
    publication_status: 'UNPUBLISHED',
    output_type: 'PAPER',
    external_url: null,
    authors_snapshot: [],
    created_by: ownerId,
    released_by: null,
    released_at: null,
    created_at: new Date('2026-11-12T12:00:00.000Z'),
    updated_at: new Date('2026-11-12T12:00:00.000Z'),
  };

  const createTxMock = () => ({
    $queryRaw: vi.fn(),
    research_outputs: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    output_revisions: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    output_topics: { findMany: vi.fn() },
    output_authors: { findMany: vi.fn() },
  });

  const createPrismaMock = () => {
    const tx = createTxMock();
    return {
      tx,
      $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
      $queryRaw: vi.fn(),
      research_outputs: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      output_revisions: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      output_topics: { findMany: vi.fn() },
    };
  };

  const createProvenanceMock = () => ({
    confirmField: vi.fn(),
    recordProvenance: vi.fn(),
    isFieldLocked: vi.fn(),
  });

  const setupController = async (
    prismaMock: ReturnType<typeof createPrismaMock>,
    provenanceMock: ReturnType<typeof createProvenanceMock>,
  ) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OutputsController],
      providers: [
        OutputsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ProvenanceService, useValue: provenanceMock },
      ],
    }).compile();

    return moduleRef.get<OutputsController>(OutputsController);
  };

  describe('updateRevision', () => {
    it('updates the draft revision and locks every corrected field', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue({
        id: outputId,
        owner_id: ownerId,
      });
      prismaMock.output_revisions.findFirst.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_revisions.update.mockResolvedValue({
        ...mockDraftRevision,
        title: 'Corrected Title',
        venue: 'Journal of Fixes',
      });

      const controller = await setupController(prismaMock, provenanceMock);
      const result = await controller.updateRevision(outputId, ownerId, {
        title: 'Corrected Title',
        venue: 'Journal of Fixes',
      });

      expect(result.title).toBe('Corrected Title');
      expect(prismaMock.tx.output_revisions.update).toHaveBeenCalledWith({
        where: { id: draftRevId },
        data: { title: 'Corrected Title', venue: 'Journal of Fixes' },
      });
      // The corrected fields are locked so a later sync cannot overwrite
      // what a person stood behind.
      expect(provenanceMock.confirmField).toHaveBeenCalledTimes(2);
      expect(provenanceMock.confirmField).toHaveBeenCalledWith(
        expect.anything(),
        {
          entityType: 'OUTPUT',
          entityId: outputId,
          fieldName: 'title',
        },
      );
      expect(provenanceMock.confirmField).toHaveBeenCalledWith(
        expect.anything(),
        {
          entityType: 'OUTPUT',
          entityId: outputId,
          fieldName: 'venue',
        },
      );
    });

    it('does not touch fields the caller did not send', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue({
        id: outputId,
        owner_id: ownerId,
      });
      prismaMock.output_revisions.findFirst.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_revisions.update.mockResolvedValue(
        mockDraftRevision,
      );

      const controller = await setupController(prismaMock, provenanceMock);
      await controller.updateRevision(outputId, ownerId, {
        publicationYear: 2026,
      });

      expect(prismaMock.tx.output_revisions.update).toHaveBeenCalledWith({
        where: { id: draftRevId },
        data: { publication_year: 2026 },
      });
      expect(provenanceMock.confirmField).toHaveBeenCalledTimes(1);
      expect(provenanceMock.confirmField).toHaveBeenCalledWith(
        expect.anything(),
        {
          entityType: 'OUTPUT',
          entityId: outputId,
          fieldName: 'publication_year',
        },
      );
    });

    it('clears a nullable field when it is sent as null', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue({
        id: outputId,
        owner_id: ownerId,
      });
      prismaMock.output_revisions.findFirst.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_revisions.update.mockResolvedValue(
        mockDraftRevision,
      );

      const controller = await setupController(prismaMock, provenanceMock);
      await controller.updateRevision(outputId, ownerId, {
        abstract: null,
        venue: null,
        externalUrl: null,
      });

      expect(prismaMock.tx.output_revisions.update).toHaveBeenCalledWith({
        where: { id: draftRevId },
        data: { abstract: null, venue: null, external_url: null },
      });
    });

    it('refuses to edit a work the caller does not own', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue({
        id: outputId,
        owner_id: otherUserId,
      });

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.updateRevision(outputId, ownerId, { title: 'Mine now' }),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.outputs.outputNotOwner,
      });
    });

    it('refuses to edit a released revision', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue({
        id: outputId,
        owner_id: ownerId,
      });
      // No draft revision, but a released one exists.
      prismaMock.output_revisions.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: draftRevId });

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.updateRevision(outputId, ownerId, { title: 'Too late' }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: domainErrorCodes.outputs.outputRevisionLocked,
      });
    });

    it('returns 404 when the output does not exist', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.research_outputs.findUnique.mockResolvedValue(null);

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.updateRevision(outputId, ownerId, { title: 'Nothing' }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: domainErrorCodes.outputs.outputNotFound,
      });
    });
  });

  describe('publish', () => {
    it('releases the draft, pins it, shares the work and sets the visibility', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique
        .mockResolvedValueOnce(mockDraftOutput)
        .mockResolvedValueOnce({
          ...mockDraftOutput,
          sharing_status: OutputSharingStatus.SHARED,
          current_release_id: draftRevId,
          first_shared_at: now,
        });
      prismaMock.tx.output_revisions.findFirst.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_revisions.update.mockResolvedValue({
        ...mockDraftRevision,
        released_at: now,
        released_by: ownerId,
      });
      prismaMock.tx.research_outputs.update.mockResolvedValue({
        ...mockDraftOutput,
        sharing_status: OutputSharingStatus.SHARED,
        current_release_id: draftRevId,
      });
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ now }]);
      prismaMock.tx.output_revisions.findUnique.mockResolvedValue({
        ...mockDraftRevision,
        released_at: now,
      });
      prismaMock.tx.output_topics.findMany.mockResolvedValue([]);

      const controller = await setupController(prismaMock, provenanceMock);
      const result = await controller.publish(outputId, ownerId, {
        visibility: OutputFileVisibility.FPTU_COMMUNITY,
      });

      expect(prismaMock.tx.output_revisions.update).toHaveBeenCalledWith({
        where: { id: draftRevId },
        data: { released_at: now, released_by: ownerId },
      });
      expect(prismaMock.tx.research_outputs.update).toHaveBeenCalledWith({
        where: { id: outputId },
        data: {
          current_release_id: draftRevId,
          sharing_status: OutputSharingStatus.SHARED,
          first_shared_at: now,
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
          access_group_id: null,
        },
      });
      expect(result.sharingStatus).toBe(OutputSharingStatus.SHARED);
    });

    it('scopes a group work to the group and checks the caller is a member', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue(
        mockDraftOutput,
      );
      prismaMock.tx.output_revisions.findFirst.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_revisions.update.mockResolvedValue({
        ...mockDraftRevision,
        released_at: now,
      });
      prismaMock.tx.research_outputs.update.mockResolvedValue(mockDraftOutput);
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ allowed: true }])
        .mockResolvedValueOnce([{ now }]);
      prismaMock.tx.output_revisions.findUnique.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_topics.findMany.mockResolvedValue([]);

      const controller = await setupController(prismaMock, provenanceMock);
      await controller.publish(outputId, ownerId, {
        visibility: OutputFileVisibility.RESEARCH_GROUP,
        accessGroupId: groupId,
      });

      expect(prismaMock.tx.research_outputs.update).toHaveBeenCalledWith({
        where: { id: outputId },
        data: expect.objectContaining({
          visibility: OutputFileVisibility.RESEARCH_GROUP,
          access_group_id: groupId,
        }),
      });
    });

    it('refuses to scope a work to a group the caller is not a member of', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue(
        mockDraftOutput,
      );
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ allowed: false }]);

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.publish(outputId, ownerId, {
          visibility: OutputFileVisibility.RESEARCH_GROUP,
          accessGroupId: groupId,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputAccessGroupInvalid,
      });
    });

    it('refuses a group visibility without an access group', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.publish(outputId, ownerId, {
          visibility: OutputFileVisibility.RESEARCH_GROUP,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputVisibilityInvalid,
      });
    });

    it('accepts an access group with a community visibility when the caller is a member', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue(
        mockDraftOutput,
      );
      prismaMock.tx.output_revisions.findFirst.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_revisions.update.mockResolvedValue({
        ...mockDraftRevision,
        released_at: now,
      });
      prismaMock.tx.research_outputs.update.mockResolvedValue(mockDraftOutput);
      prismaMock.tx.$queryRaw
        .mockResolvedValueOnce([{ allowed: true }])
        .mockResolvedValueOnce([{ now }]);
      prismaMock.tx.output_revisions.findUnique.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_topics.findMany.mockResolvedValue([]);

      const controller = await setupController(prismaMock, provenanceMock);
      await controller.publish(outputId, ownerId, {
        visibility: OutputFileVisibility.FPTU_COMMUNITY,
        accessGroupId: groupId,
      });

      expect(prismaMock.tx.research_outputs.update).toHaveBeenCalledWith({
        where: { id: outputId },
        data: expect.objectContaining({
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
          access_group_id: groupId,
        }),
      });
    });

    it('refuses a community-affiliated work scoped to a group the caller is not a member of', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue(
        mockDraftOutput,
      );
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ allowed: false }]);

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.publish(outputId, ownerId, {
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
          accessGroupId: groupId,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputAccessGroupInvalid,
      });
    });

    it('refuses to publish a work the caller does not own', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue({
        ...mockDraftOutput,
        owner_id: otherUserId,
      });

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.publish(outputId, ownerId, {
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.outputs.outputNotOwner,
      });
    });

    it('refuses to publish a work that is already published', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue({
        ...mockDraftOutput,
        sharing_status: OutputSharingStatus.SHARED,
      });

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.publish(outputId, ownerId, {
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: domainErrorCodes.outputs.outputAlreadyPublished,
      });
    });

    it('refuses to publish a work with no editable draft', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue(
        mockDraftOutput,
      );
      prismaMock.tx.output_revisions.findFirst.mockResolvedValue(null);

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.publish(outputId, ownerId, {
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: domainErrorCodes.outputs.outputNotPublishable,
      });
    });
  });

  describe('updateVisibility', () => {
    const mockSharedOutput = {
      ...mockDraftOutput,
      sharing_status: OutputSharingStatus.SHARED,
      current_release_id: draftRevId,
      visibility: OutputFileVisibility.RESEARCH_GROUP,
      access_group_id: groupId,
      output_authors: [],
    };

    const mockLoadedOutput = {
      ...mockSharedOutput,
      visibility: OutputFileVisibility.FPTU_COMMUNITY,
      output_authors: [],
    };

    it('lets the owner open an affiliated work to the community while keeping the group', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique
        .mockResolvedValueOnce(mockSharedOutput)
        .mockResolvedValueOnce(mockLoadedOutput);
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ allowed: true }]);
      prismaMock.tx.research_outputs.update.mockResolvedValue(
        mockLoadedOutput,
      );
      prismaMock.tx.output_revisions.findUnique.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_topics.findMany.mockResolvedValue([]);

      const controller = await setupController(prismaMock, provenanceMock);
      const result = await controller.updateVisibility(outputId, ownerId, {
        visibility: OutputFileVisibility.FPTU_COMMUNITY,
      });

      expect(prismaMock.tx.research_outputs.update).toHaveBeenCalledWith({
        where: { id: outputId },
        data: {
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
          access_group_id: groupId,
        },
      });
      expect(result.visibility).toBe(OutputFileVisibility.FPTU_COMMUNITY);
      expect(result.accessGroupId).toBe(groupId);
    });

    it('lets the lead of the affiliated group change visibility', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique
        .mockResolvedValueOnce(mockSharedOutput)
        .mockResolvedValueOnce(mockLoadedOutput);
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ allowed: true }]);
      prismaMock.tx.research_outputs.update.mockResolvedValue(
        mockLoadedOutput,
      );
      prismaMock.tx.output_revisions.findUnique.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_topics.findMany.mockResolvedValue([]);

      const controller = await setupController(prismaMock, provenanceMock);
      await controller.updateVisibility(outputId, otherUserId, {
        visibility: OutputFileVisibility.FPTU_COMMUNITY,
      });

      expect(prismaMock.tx.research_outputs.update).toHaveBeenCalled();
    });

    it('refuses a caller who is neither owner nor group lead', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue(
        mockSharedOutput,
      );
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ allowed: false }]);

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.updateVisibility(outputId, otherUserId, {
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        code: domainErrorCodes.outputs.outputAccessDenied,
      });
    });

    it('refuses a group visibility with no affiliated group', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue({
        ...mockSharedOutput,
        access_group_id: null,
      });

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.updateVisibility(outputId, ownerId, {
          visibility: OutputFileVisibility.RESEARCH_GROUP,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputVisibilityInvalid,
      });
    });

    it('refuses to change visibility of an unpublished work', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue(
        mockDraftOutput,
      );

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(
        controller.updateVisibility(outputId, ownerId, {
          visibility: OutputFileVisibility.FPTU_COMMUNITY,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        code: domainErrorCodes.outputs.outputNotArchived,
      });
    });
  });

  describe('archive', () => {
    it('archives a published work and keeps its first shared timestamp', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique
        .mockResolvedValueOnce({
          ...mockDraftOutput,
          sharing_status: OutputSharingStatus.SHARED,
        })
        .mockResolvedValueOnce({
          ...mockDraftOutput,
          sharing_status: OutputSharingStatus.ARCHIVED,
        });
      prismaMock.tx.research_outputs.update.mockResolvedValue({
        ...mockDraftOutput,
        sharing_status: OutputSharingStatus.ARCHIVED,
      });
      prismaMock.tx.$queryRaw.mockResolvedValueOnce([{ now }]);
      prismaMock.tx.output_revisions.findUnique.mockResolvedValue(
        mockDraftRevision,
      );
      prismaMock.tx.output_topics.findMany.mockResolvedValue([]);

      const controller = await setupController(prismaMock, provenanceMock);
      const result = await controller.archive(outputId, ownerId);

      expect(prismaMock.tx.research_outputs.update).toHaveBeenCalledWith({
        where: { id: outputId },
        data: {
          sharing_status: OutputSharingStatus.ARCHIVED,
          archived_at: now,
        },
      });
      expect(result.sharingStatus).toBe(OutputSharingStatus.ARCHIVED);
    });

    it('refuses to archive a work that was never published', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue(
        mockDraftOutput,
      );

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(controller.archive(outputId, ownerId)).rejects.toMatchObject(
        {
          status: HttpStatus.CONFLICT,
          code: domainErrorCodes.outputs.outputNotArchived,
        },
      );
    });

    it('refuses to archive a work the caller does not own', async () => {
      const prismaMock = createPrismaMock();
      const provenanceMock = createProvenanceMock();
      prismaMock.tx.research_outputs.findUnique.mockResolvedValue({
        ...mockDraftOutput,
        owner_id: otherUserId,
      });

      const controller = await setupController(prismaMock, provenanceMock);

      await expect(controller.archive(outputId, ownerId)).rejects.toMatchObject(
        {
          status: HttpStatus.FORBIDDEN,
          code: domainErrorCodes.outputs.outputNotOwner,
        },
      );
    });
  });
});
