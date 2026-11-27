import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  OutputAudience,
  OutputScopeType,
  PrismaService,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { describe, expect, it, vi } from 'vitest';
import { ProvenanceService } from '../provenance/provenance.service.js';
import { ArticleCreationUploadService } from '../storage/article-creation-upload.service.js';
import { OutputsController } from './outputs.controller.js';
import { OutputsService } from './outputs.service.js';

/**
 * Where a work is posted, and who may read it.
 *
 * The scope of a work - the container it was posted into, and therefore
 * who owns it - is fixed at creation and decides who may change its
 * audience. The audience is what decides who may read it.
 *
 * These four containers are the whole model:
 *
 *   PERSONAL                - the author owns it
 *   GROUP                   - the group's leads own it
 *   PROJECT inside a group  - the project lead and the parent group's leads own it
 *   PROJECT standalone     - the project lead owns it
 *
 * The rules themselves live in the database, and the schema smoke test
 * pins them down there. What is tested here is the part the service
 * owns: that it resolves the scope to the right container and the right
 * starting audience, and that it refuses a container the caller may not
 * post into.
 */
describe('Output scope resolution', () => {
  const authorId = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  const groupId = '33333333-3333-4333-8333-333333333333';
  const outputId = '44444444-4444-4444-8444-444444444444';
  const revisionId = '55555555-5555-4555-8555-555555555555';

  const createPrismaMock = () => {
    const tx = {
      $queryRaw: vi.fn(),
      research_outputs: {
        create: vi.fn().mockResolvedValue({ id: outputId }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      output_revisions: {
        create: vi.fn().mockResolvedValue({ id: revisionId }),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      output_authors: {
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      output_topics: {
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      output_files: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      users: { count: vi.fn().mockResolvedValue(0) },
      research_topics: { count: vi.fn().mockResolvedValue(0) },
    };

    return {
      tx,
      $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)),
      $queryRaw: vi.fn(),
      research_outputs: {
        findUnique: vi.fn().mockResolvedValue(null),
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

  const setupController = async (
    prismaMock: ReturnType<typeof createPrismaMock>,
  ) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OutputsController],
      providers: [
        OutputsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ProvenanceService,
          useValue: {
            confirmField: vi.fn(),
            recordProvenance: vi.fn(),
            isFieldLocked: vi.fn(),
          },
        },
        { provide: ArticleCreationUploadService, useValue: {} },
      ],
    }).compile();

    return moduleRef.get<OutputsController>(OutputsController);
  };

  /**
   * Answers the queries the service makes while resolving a scope.
   *
   * The queries are answered by their SQL rather than by their position,
   * because the service makes other queries around them - the researcher
   * check, the advisory lock, the database clock - and a positional mock
   * would break every time one of those changed.
   */
  const answerScopeQueries = (
    prismaMock: ReturnType<typeof createPrismaMock>,
    answers: {
      isResearcher?: boolean;
      project?: { lead_id: string; group_id: string | null } | null;
      member?: boolean;
      audience?: OutputAudience;
    },
  ) => {
    prismaMock.tx.$queryRaw.mockImplementation(async (query: unknown) => {
      // A tagged template arrives as the array of its literal chunks; a
      // `Prisma.sql` fragment arrives as an object with a `text`.
      const sql = Array.isArray(query)
        ? query.join(' ')
        : typeof query === 'string'
          ? query
          : String((query as { text?: string })?.text ?? '');

      // The order matters: the project membership query mentions the
      // researcher check and the group members too, so the narrow
      // answers have to be given first.
      if (sql.includes('project_members')) {
        return [{ allowed: answers.member ?? true }];
      }
      if (sql.includes('FROM research_projects')) {
        return answers.project ? [answers.project] : [];
      }
      if (sql.includes('group_default_audience')) {
        return [{ audience: answers.audience ?? OutputAudience.CONTAINER }];
      }
      if (sql.includes('is_group_member')) {
        return [{ allowed: answers.member ?? true }];
      }
      if (sql.includes('is_researcher')) {
        return [{ allowed: answers.isResearcher ?? true }];
      }
      if (sql.includes('clock_timestamp')) {
        return [{ now: new Date('2026-11-13T00:00:00.000Z') }];
      }
      // The advisory lock and any other bookkeeping query.
      return [];
    });
  };

  const createArticle = (scope?: {
    scopeType: OutputScopeType;
    scopeGroupId?: string;
    scopeProjectId?: string;
  }) => ({
    title: 'A scoped work',
    authors: [{ name: 'Author', order: 1 }],
    abstract: 'An abstract.',
    publicationDate: '2026-01-01',
    outputType: 'ARTICLE',
    keywords: [],
    topicIds: [],
    scope,
  });

  describe('a personal work', () => {
    it('is scoped to the author and starts private', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {});

      const controller = await setupController(prismaMock);
      await controller.createArticle(authorId, createArticle(), 'key-personal');

      expect(prismaMock.tx.research_outputs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope_type: OutputScopeType.PERSONAL,
            scope_group_id: null,
            scope_project_id: null,
            audience: OutputAudience.FPTU_COMMUNITY,
          }),
        }),
      );
    });
  });

  describe('a work inside a group', () => {
    it('takes the group default audience', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {
        member: true,
        audience: OutputAudience.CONTAINER,
      });

      const controller = await setupController(prismaMock);
      await controller.createArticle(
        authorId,
        createArticle({
          scopeType: OutputScopeType.GROUP,
          scopeGroupId: groupId,
        }),
        'key-group',
      );

      expect(prismaMock.tx.research_outputs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope_type: OutputScopeType.GROUP,
            scope_group_id: groupId,
            scope_project_id: null,
            audience: OutputAudience.CONTAINER,
          }),
        }),
      );
    });

    it('takes the community audience when the group defaults to it', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {
        member: true,
        audience: OutputAudience.FPTU_COMMUNITY,
      });

      const controller = await setupController(prismaMock);
      await controller.createArticle(
        authorId,
        createArticle({
          scopeType: OutputScopeType.GROUP,
          scopeGroupId: groupId,
        }),
        'key-group-community',
      );

      expect(prismaMock.tx.research_outputs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            audience: OutputAudience.FPTU_COMMUNITY,
          }),
        }),
      );
    });

    it('refuses a group the caller does not belong to', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, { member: false });

      const controller = await setupController(prismaMock);

      await expect(
        controller.createArticle(
          authorId,
          createArticle({
            scopeType: OutputScopeType.GROUP,
            scopeGroupId: groupId,
          }),
          'key-group-denied',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputScopeInvalid,
      });

      expect(prismaMock.tx.research_outputs.create).not.toHaveBeenCalled();
    });
  });

  describe('a work inside a project of a group', () => {
    it('names the project and its parent group', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {
        project: { lead_id: authorId, group_id: groupId },
        member: true,
        audience: OutputAudience.CONTAINER,
      });

      const controller = await setupController(prismaMock);
      await controller.createArticle(
        authorId,
        createArticle({
          scopeType: OutputScopeType.PROJECT,
          scopeProjectId: projectId,
        }),
        'key-project-group',
      );

      expect(prismaMock.tx.research_outputs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope_type: OutputScopeType.PROJECT,
            scope_project_id: projectId,
            scope_group_id: groupId,
            audience: OutputAudience.CONTAINER,
          }),
        }),
      );
    });

    it('takes the parent group default audience', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {
        project: { lead_id: authorId, group_id: groupId },
        member: true,
        audience: OutputAudience.FPTU_COMMUNITY,
      });

      const controller = await setupController(prismaMock);
      await controller.createArticle(
        authorId,
        createArticle({
          scopeType: OutputScopeType.PROJECT,
          scopeProjectId: projectId,
        }),
        'key-project-group-community',
      );

      expect(prismaMock.tx.research_outputs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            audience: OutputAudience.FPTU_COMMUNITY,
          }),
        }),
      );
    });
  });

  describe('a work inside a standalone project', () => {
    it('names the project and no group', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {
        project: { lead_id: authorId, group_id: null },
        member: true,
        audience: OutputAudience.CONTAINER,
      });

      const controller = await setupController(prismaMock);
      await controller.createArticle(
        authorId,
        createArticle({
          scopeType: OutputScopeType.PROJECT,
          scopeProjectId: projectId,
        }),
        'key-standalone',
      );

      expect(prismaMock.tx.research_outputs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope_type: OutputScopeType.PROJECT,
            scope_project_id: projectId,
            scope_group_id: null,
            audience: OutputAudience.CONTAINER,
          }),
        }),
      );
    });

    it('refuses a project that does not exist', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {
        project: null,
        member: true,
      });

      const controller = await setupController(prismaMock);

      await expect(
        controller.createArticle(
          authorId,
          createArticle({
            scopeType: OutputScopeType.PROJECT,
            scopeProjectId: projectId,
          }),
          'key-missing-project',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputScopeInvalid,
      });

      expect(prismaMock.tx.research_outputs.create).not.toHaveBeenCalled();
    });

    it('refuses a project the caller may not post into', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {
        project: { lead_id: authorId, group_id: null },
        member: false,
      });

      const controller = await setupController(prismaMock);

      await expect(
        controller.createArticle(
          authorId,
          createArticle({
            scopeType: OutputScopeType.PROJECT,
            scopeProjectId: projectId,
          }),
          'key-project-denied',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputScopeInvalid,
      });

      expect(prismaMock.tx.research_outputs.create).not.toHaveBeenCalled();
    });
  });

  describe('a malformed scope', () => {
    it('refuses a group scope without a group', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {});

      const controller = await setupController(prismaMock);

      await expect(
        controller.createArticle(
          authorId,
          createArticle({ scopeType: OutputScopeType.GROUP }),
          'key-no-group',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputScopeInvalid,
      });
    });

    it('refuses a project scope without a project', async () => {
      const prismaMock = createPrismaMock();
      answerScopeQueries(prismaMock, {});

      const controller = await setupController(prismaMock);

      await expect(
        controller.createArticle(
          authorId,
          createArticle({ scopeType: OutputScopeType.PROJECT }),
          'key-no-project',
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.outputs.outputScopeInvalid,
      });
    });
  });
});
