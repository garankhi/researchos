import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  OpportunityKind,
  OpportunityStatus,
  PrismaService,
  TargetAudience,
} from '@researchos/database';
import { OpportunitiesService } from './opportunities.service.js';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities-query.dto.js';

const actor = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const draft = {
  title: '',
  opportunityKind: OpportunityKind.RESEARCH_COLLABORATION,
};
const row = {
  ...draft,
  id,
  creatorId: actor,
  groupId: null,
  projectId: null,
  targetAudience: TargetAudience.ANY_RESEARCHER,
  expectedRole: null,
  requiredExpertiseTags: [],
  description: null,
  responseSlaDays: 5,
  status: OpportunityStatus.DRAFT,
  applicationDeadline: null,
  publishedAt: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('OpportunitiesService', () => {
  let service: OpportunitiesService;
  const tx = {
    $queryRaw: vi.fn(),
    researchOpportunity: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    service = new OpportunitiesService({
      $transaction: vi.fn((callback) => callback(tx)),
    } as unknown as PrismaService);
    tx.$queryRaw.mockResolvedValue([{ allowed: true }]);
    tx.researchOpportunity.create.mockResolvedValue(row);
    tx.researchOpportunity.findUniqueOrThrow.mockResolvedValue(row);
    tx.researchOpportunity.update.mockResolvedValue(row);
    tx.researchOpportunity.findUnique.mockResolvedValue(null);
  });

  it('sets creator from the session and lets the database supply the SLA default', async () => {
    const result = await service.create(actor, draft);
    expect(result).toMatchObject({
      creatorId: actor,
      responseSlaDays: 5,
      status: 'DRAFT',
    });
    expect(tx.researchOpportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creatorId: actor,
        requiredExpertiseTags: [],
      }),
    });
    expect(result).not.toHaveProperty('createdAt');
    expect(tx.researchOpportunity.update).not.toHaveBeenCalled();
  });

  it.each(['OPEN', 'FILLED', 'CLOSED', 'EXPIRED'] as const)(
    'rejects creating %s even when publication details are complete',
    async (status) => {
      await expect(
        service.create(actor, {
          ...draft,
          status,
          title: 'Complete',
          description: 'Details',
          applicationDeadline: '2099-01-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.researchOpportunity.create).not.toHaveBeenCalled();
    },
  );

  it('rejects non-researchers before writing', async () => {
    tx.$queryRaw.mockResolvedValue([{ allowed: false }]);
    await expect(service.create(actor, draft)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.researchOpportunity.create).not.toHaveBeenCalled();
  });

  it('rejects group creation without lead or core membership', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: false }]);
    await expect(
      service.create(actor, { ...draft, groupId: id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a project scoped to a different group', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ leadId: actor, groupId: id }]);
    await expect(
      service.create(actor, { ...draft, projectId: id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists and replays the original create response without inserting again', async () => {
    const first = await service.create(actor, draft, 'retry-1');
    const saved = tx.researchOpportunity.update.mock.calls[0][0].data;
    tx.researchOpportunity.findUnique.mockResolvedValue(saved);
    const second = await service.create(
      actor,
      { opportunityKind: draft.opportunityKind, title: '' },
      'retry-1',
    );
    expect(second).toEqual(first);
    expect(tx.researchOpportunity.create).toHaveBeenCalledTimes(1);
    expect(tx.researchOpportunity.findUnique).toHaveBeenCalledWith({
      where: {
        creatorId_createIdempotencyKey: {
          creatorId: actor,
          createIdempotencyKey: 'retry-1',
        },
      },
      select: { createRequestHash: true, createResponse: true },
    });
    expect(tx.researchOpportunity.update).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a key with a changed payload', async () => {
    await service.create(actor, draft, 'retry-1');
    tx.researchOpportunity.findUnique.mockResolvedValue(
      tx.researchOpportunity.update.mock.calls[0][0].data,
    );
    await expect(
      service.create(actor, { ...draft, title: 'Different' }, 'retry-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.researchOpportunity.create).toHaveBeenCalledTimes(1);
  });

  it('replays the original response after the opportunity has been edited', async () => {
    const original = await service.create(actor, draft, 'retry-1');
    const saved = tx.researchOpportunity.update.mock.calls[0][0].data;
    tx.researchOpportunity.findUnique.mockResolvedValue({
      ...row,
      ...saved,
      title: 'Edited later',
    });
    const replay = await service.create(actor, draft, 'retry-1');
    expect(replay).toEqual(original);
    expect(replay.title).toBe('');
    expect(replay).not.toHaveProperty('createRequestHash');
    expect(replay).not.toHaveProperty('createIdempotencyKey');
    expect(replay).not.toHaveProperty('createResponse');
    expect(tx.researchOpportunity.create).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite creation metadata when PATCHing an opportunity', async () => {
    await service.update(actor, id, { title: 'Edited later' });
    const data = tx.researchOpportunity.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('createIdempotencyKey');
    expect(data).not.toHaveProperty('createRequestHash');
    expect(data).not.toHaveProperty('createResponse');
  });

  it.each(['', ' ', 'x'.repeat(201)])(
    'rejects invalid idempotency keys',
    async (key) => {
      await expect(service.create(actor, draft, key)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('rejects an edit by a non-manager', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: false }]);
    await expect(
      service.update(actor, id, { title: 'Changed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.researchOpportunity.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an absent edit target', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([]);
    await expect(service.update(actor, id, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('validates publication against the merged record and allows partial edits', async () => {
    tx.researchOpportunity.findUniqueOrThrow.mockResolvedValue({
      ...row,
      title: 'Complete',
      description: 'Details',
      applicationDeadline: new Date(),
      publishedAt: new Date(),
    });
    await service.update(actor, id, { description: 'Updated details' });
    expect(tx.researchOpportunity.update).toHaveBeenCalled();
  });

  it('rejects clearing a required field on an already published record', async () => {
    tx.researchOpportunity.findUniqueOrThrow.mockResolvedValue({
      ...row,
      title: 'Complete',
      description: 'Details',
      status: OpportunityStatus.OPEN,
      applicationDeadline: new Date(),
      publishedAt: new Date(),
    });
    await expect(
      service.update(actor, id, { description: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.researchOpportunity.update).not.toHaveBeenCalled();
  });

  it('conceals an invisible detail as 404', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.findOne(actor, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.researchOpportunity.findUnique).not.toHaveBeenCalled();
  });

  it('returns bounded pagination metadata with a safe numeric count', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id }])
      .mockResolvedValueOnce([{ total: 1n }]);
    tx.researchOpportunity.findMany.mockResolvedValue([row]);
    expect(
      await service.findAll(actor, new ListOpportunitiesQueryDto()),
    ).toMatchObject({ page: 1, pageSize: 20, total: 1, items: [{ id }] });
  });
});
