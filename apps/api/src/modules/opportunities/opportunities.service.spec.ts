import {
  BadRequestException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';
import { domainErrorCodes } from '@researchos/error-codes';
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
  title: draft.title,
  opportunity_kind: draft.opportunityKind,
  id,
  creator_id: actor,
  group_id: null,
  project_id: null,
  target_audience: TargetAudience.ANY_RESEARCHER,
  expected_role: null,
  required_expertise_tags: [],
  description: null,
  response_sla_days: 5,
  status: OpportunityStatus.DRAFT,
  application_deadline: null,
  published_at: null,
  archived_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('OpportunitiesService', () => {
  let service: OpportunitiesService;
  const tx = {
    $queryRaw: vi.fn(),
    research_opportunities: {
      updateManyAndReturn: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: { createMany: vi.fn() },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    service = new OpportunitiesService({
      $transaction: vi.fn((callback) => callback(tx)),
    } as unknown as PrismaService);
    tx.$queryRaw.mockResolvedValue([{ allowed: true }]);
    tx.research_opportunities.updateManyAndReturn.mockResolvedValue([]);
    tx.research_opportunities.create.mockResolvedValue(row);
    tx.research_opportunities.findUniqueOrThrow.mockResolvedValue(row);
    tx.research_opportunities.update.mockResolvedValue(row);
    tx.research_opportunities.findUnique.mockResolvedValue(null);
  });

  it('sets creator from the session and lets the database supply the SLA default', async () => {
    const result = await service.create(actor, draft);
    expect(result).toMatchObject({
      creatorId: actor,
      responseSlaDays: 5,
      status: 'DRAFT',
    });
    expect(tx.research_opportunities.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creator_id: actor,
        required_expertise_tags: [],
      }),
    });
    expect(result).not.toHaveProperty('createdAt');
    expect(tx.research_opportunities.update).not.toHaveBeenCalled();
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
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.opportunities.invalidState,
      });
      expect(tx.research_opportunities.create).not.toHaveBeenCalled();
    },
  );

  it('rejects non-researchers before writing', async () => {
    tx.$queryRaw.mockResolvedValue([{ allowed: false }]);
    await expect(service.create(actor, draft)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.identity.researcherRequired,
    });
    expect(tx.research_opportunities.create).not.toHaveBeenCalled();
  });

  it('rejects group creation without lead or core membership', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: false }]);
    await expect(
      service.create(actor, { ...draft, groupId: id }),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.opportunities.accessDenied,
    });
  });

  it('rejects a project scoped to a different group', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ leadId: actor, groupId: id }]);
    await expect(
      service.create(actor, { ...draft, projectId: id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an upper case group id that names the same group', async () => {
    // PostgreSQL returns a UUID in lower case, while the DTO accepts the
    // same UUID in upper case. The two name the same group, so the scope
    // check must not treat them as a mismatch.
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ leadId: actor, groupId: id }]);
    await expect(
      service.create(actor, {
        ...draft,
        groupId: id.toUpperCase(),
        projectId: id,
      }),
    ).resolves.toMatchObject({ id });
    expect(tx.research_opportunities.create).toHaveBeenCalled();
  });

  it('still rejects a project scoped to a genuinely different group', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([
        { leadId: actor, groupId: '00000000-0000-4000-8000-00000000ffff' },
      ]);
    await expect(
      service.create(actor, {
        ...draft,
        groupId: id.toUpperCase(),
        projectId: id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.research_opportunities.create).not.toHaveBeenCalled();
  });

  it('persists and replays the original create response without inserting again', async () => {
    const first = await service.create(actor, draft, 'retry-1');
    const saved = tx.research_opportunities.update.mock.calls[0][0].data;
    tx.research_opportunities.findUnique.mockResolvedValue(saved);
    const second = await service.create(
      actor,
      { opportunityKind: draft.opportunityKind, title: '' },
      'retry-1',
    );
    expect(second).toEqual(first);
    expect(tx.research_opportunities.create).toHaveBeenCalledTimes(1);
    expect(tx.research_opportunities.findUnique).toHaveBeenCalledWith({
      where: {
        creator_id_create_idempotency_key: {
          creator_id: actor,
          create_idempotency_key: 'retry-1',
        },
      },
      select: { create_request_hash: true, create_response: true },
    });
    expect(tx.research_opportunities.update).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a key with a changed payload', async () => {
    await service.create(actor, draft, 'retry-1');
    tx.research_opportunities.findUnique.mockResolvedValue(
      tx.research_opportunities.update.mock.calls[0][0].data,
    );
    await expect(
      service.create(actor, { ...draft, title: 'Different' }, 'retry-1'),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      code: domainErrorCodes.opportunities.idempotencyKeyConflict,
    });
    expect(tx.research_opportunities.create).toHaveBeenCalledTimes(1);
  });

  it('replays the original response after the opportunity has been edited', async () => {
    const original = await service.create(actor, draft, 'retry-1');
    const saved = tx.research_opportunities.update.mock.calls[0][0].data;
    tx.research_opportunities.findUnique.mockResolvedValue({
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
    expect(tx.research_opportunities.create).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite creation metadata when PATCHing an opportunity', async () => {
    await service.update(actor, id, { title: 'Edited later' });
    const data = tx.research_opportunities.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('create_idempotency_key');
    expect(data).not.toHaveProperty('create_request_hash');
    expect(data).not.toHaveProperty('create_response');
  });

  it.each(['', ' ', 'x'.repeat(201)])(
    'rejects invalid idempotency keys',
    async (key) => {
      await expect(service.create(actor, draft, key)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        code: domainErrorCodes.opportunities.idempotencyKeyInvalid,
      });
    },
  );

  it('rejects an edit by a non-manager', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: false }]);
    await expect(
      service.update(actor, id, { title: 'Changed' }),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.opportunities.accessDenied,
    });
    expect(tx.research_opportunities.update).not.toHaveBeenCalled();
  });

  it('returns 404 for an absent edit target', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([]);
    await expect(service.update(actor, id, {})).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: domainErrorCodes.opportunities.notFound,
    });
  });

  it('validates publication against the merged record and allows partial edits', async () => {
    tx.research_opportunities.findUniqueOrThrow.mockResolvedValue({
      ...row,
      title: 'Complete',
      description: 'Details',
      application_deadline: new Date(),
      published_at: new Date(),
    });
    await service.update(actor, id, { description: 'Updated details' });
    expect(tx.research_opportunities.update).toHaveBeenCalled();
  });

  it('rejects clearing a required field on an already published record', async () => {
    tx.research_opportunities.findUniqueOrThrow.mockResolvedValue({
      ...row,
      title: 'Complete',
      description: 'Details',
      status: OpportunityStatus.OPEN,
      application_deadline: new Date(),
      published_at: new Date(),
    });
    await expect(
      service.update(actor, id, { description: null }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      code: domainErrorCodes.opportunities.invalidState,
    });
    expect(tx.research_opportunities.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing detail', async () => {
    tx.research_opportunities.findUnique.mockResolvedValue(null);
    await expect(service.findOne(actor, id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: domainErrorCodes.opportunities.notFound,
    });
  });

  it('denies an invisible detail as 403', async () => {
    tx.research_opportunities.findUnique.mockResolvedValue(row);
    tx.$queryRaw.mockResolvedValue([]);
    await expect(service.findOne(actor, id)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: domainErrorCodes.opportunities.accessDenied,
    });
  });

  it('returns bounded pagination metadata with a safe numeric count', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id }])
      .mockResolvedValueOnce([{ total: 1n }]);
    tx.research_opportunities.findMany.mockResolvedValue([row]);
    expect(
      await service.findAll(actor, new ListOpportunitiesQueryDto()),
    ).toMatchObject({ page: 1, pageSize: 20, total: 1, items: [{ id }] });
  });

  it('filters by creator without dropping the visibility predicate', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id }])
      .mockResolvedValueOnce([{ total: 1n }]);
    tx.research_opportunities.findMany.mockResolvedValue([row]);

    const query = new ListOpportunitiesQueryDto();
    query.creatorId = '00000000-0000-4000-8000-000000000009';

    await service.findAll(actor, query);

    const sql = JSON.stringify(tx.$queryRaw.mock.calls[0][1]);
    // The creator filter narrows the result set; the visibility predicate
    // still decides which rows the caller may see at all.
    expect(sql).toContain('o.creator_id = ');
    expect(sql).toContain('can_manage_opportunity');
    expect(tx.$queryRaw.mock.calls[0][1].values).toContain(
      '00000000-0000-4000-8000-000000000009',
    );
  });

  it('omits the creator condition when the filter is absent', async () => {
    tx.$queryRaw
      .mockResolvedValueOnce([{ id }])
      .mockResolvedValueOnce([{ total: 1n }]);
    tx.research_opportunities.findMany.mockResolvedValue([row]);

    await service.findAll(actor, new ListOpportunitiesQueryDto());

    expect(JSON.stringify(tx.$queryRaw.mock.calls[0][1])).not.toContain(
      'o.creator_id',
    );
  });
});
