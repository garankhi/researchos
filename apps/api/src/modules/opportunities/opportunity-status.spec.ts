import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { domainErrorCodes } from '@researchos/error-codes';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  OpportunityKind,
  OpportunityStatus,
  PrismaService,
  TargetAudience,
} from '@researchos/database';
import cookieParser from 'cookie-parser';
import { createHttpTestClient } from '../../../test/http-test-client.js';
import { SESSION_RESOLVER } from '../../common/auth/session-resolver.js';
import { SessionGuard } from '../../common/guards/session.guard.js';
import { OpportunitiesController } from './opportunities.controller.js';
import { OpportunitiesService } from './opportunities.service.js';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities-query.dto.js';

const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const publishedAt = new Date('2026-01-01T00:00:00Z');
const transitions = [
  ['open', OpportunityStatus.DRAFT, OpportunityStatus.OPEN],
  ['fill', OpportunityStatus.OPEN, OpportunityStatus.FILLED],
  ['close', OpportunityStatus.FILLED, OpportunityStatus.CLOSED],
] as const;

function setup(status: OpportunityStatus = OpportunityStatus.DRAFT) {
  const row = {
    id,
    creator_id: actorId,
    group_id: null,
    project_id: null,
    title: 'Research collaborators',
    description: 'Complete description',
    opportunity_kind: OpportunityKind.RESEARCH_COLLABORATION,
    target_audience: TargetAudience.ANY_RESEARCHER,
    expected_role: null,
    required_expertise_tags: [],
    response_sla_days: 5,
    status,
    application_deadline: new Date('2099-01-01T00:00:00Z'),
    published_at: status === OpportunityStatus.DRAFT ? null : publishedAt,
    archived_at: null as Date | null,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ allowed: true }]),
    research_opportunities: {
      updateManyAndReturn: vi.fn().mockImplementation(async () => {
        if (
          row.status === OpportunityStatus.OPEN &&
          row.application_deadline &&
          row.application_deadline.getTime() <= Date.now()
        ) {
          row.status = OpportunityStatus.EXPIRED;
          return [{ id }];
        }
        return [];
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => ({ ...row })),
      findUnique: vi.fn().mockImplementation(async () => ({ ...row })),
      findMany: vi.fn().mockImplementation(async () => [{ ...row }]),
      update: vi
        .fn()
        .mockImplementation(
          async ({ data }: { data: { status: OpportunityStatus } }) => {
            Object.assign(row, data);
            row.published_at ??= publishedAt;
            return { ...row };
          },
        ),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  return {
    row,
    tx,
    prisma,
    service: new OpportunitiesService(prisma as unknown as PrismaService),
  };
}

describe('Opportunity status actions', () => {
  it.each(transitions)(
    '%s records the authenticated actor and old/new statuses atomically',
    async (action, from, to) => {
      const { service, tx, prisma } = setup(from);
      const result = await service.transitionStatus(actorId, id, action);
      expect(result).toMatchObject({
        id,
        status: to,
        publishedAt: publishedAt.toISOString(),
      });
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(tx.research_opportunities.update).toHaveBeenCalledWith({
        where: { id },
        data: { status: to },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId,
          action: 'OPPORTUNITY_STATUS_CHANGED',
          entity: 'research_opportunities',
          entityId: id,
          payload: { fromStatus: from, toStatus: to },
        },
      });
    },
  );

  for (const [action, from] of transitions) {
    it.each(
      Object.values(OpportunityStatus).filter((status) => status !== from),
    )(`rejects ${action} from %s with 409 and no write`, async (status) => {
      const { service, tx } = setup(status);
      await expect(
        service.transitionStatus(actorId, id, action),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.research_opportunities.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  }

  it.each(transitions)(
    'rejects %s on archived records',
    async (action, from) => {
      const { service, row, tx } = setup(from);
      row.archived_at = new Date();
      await expect(
        service.transitionStatus(actorId, id, action),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    'title',
    'description',
    'deadline',
    'pastDeadline',
    'currentDeadline',
  ] as const)('rejects opening with invalid %s', async (field) => {
    const { service, row, tx } = setup();
    if (field === 'title') row.title = ' \t ';
    if (field === 'description') row.description = ' \n ';
    if (field === 'deadline')
      Object.assign(row, { application_deadline: null });
    if (field === 'pastDeadline')
      row.application_deadline = new Date('2000-01-01');
    if (field === 'currentDeadline')
      row.application_deadline = new Date(Date.now() - 1);
    await expect(
      service.transitionStatus(actorId, id, 'open'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.research_opportunities.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(transitions)(
    'requires researcher access for %s',
    async (action, from) => {
      const { service, tx } = setup(from);
      tx.$queryRaw.mockResolvedValue([{ allowed: false }]);
      await expect(
        service.transitionStatus(actorId, id, action),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
      expect(tx.research_opportunities.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it.each(transitions)(
    'requires opportunity management permission for %s',
    async (action, from) => {
      const { service, tx } = setup(from);
      tx.$queryRaw
        .mockResolvedValueOnce([{ allowed: true }])
        .mockResolvedValueOnce([{ allowed: false }]);
      await expect(
        service.transitionStatus(actorId, id, action),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
      expect(tx.research_opportunities.update).not.toHaveBeenCalled();
    },
  );

  it('returns 404 when the locked opportunity is missing', async () => {
    const { service, tx } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([]);
    await expect(
      service.transitionStatus(actorId, id, 'open'),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: domainErrorCodes.opportunities.notFound,
    });
    expect(tx.research_opportunities.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('does not succeed if the audit insertion fails', async () => {
    const { service, tx } = setup();
    const failure = new Error('Audit unavailable');
    tx.auditLog.create.mockRejectedValue(failure);
    await expect(service.transitionStatus(actorId, id, 'open')).rejects.toBe(
      failure,
    );
  });

  it('maps the PostgreSQL deadline/constraint race to 400 without auditing', async () => {
    const { service, tx } = setup();
    tx.research_opportunities.update.mockRejectedValue({
      code: 'P2010',
      message: 'Database constraint failed',
      meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
    });
    await expect(
      service.transitionStatus(actorId, id, 'open'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('Deadline-based opportunity expiry', () => {
  const now = new Date('2026-11-10T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it.each([-1, 0])(
    'expires an OPEN record when its deadline is now minus %s milliseconds',
    async (offset) => {
      const { service, row, tx } = setup(OpportunityStatus.OPEN);
      row.application_deadline = new Date(now.getTime() + offset);
      await expect(service.findOne(actorId, id)).resolves.toMatchObject({
        status: OpportunityStatus.EXPIRED,
      });
      expect(
        tx.research_opportunities.updateManyAndReturn,
      ).toHaveBeenCalledWith({
        where: {
          id,
          status: OpportunityStatus.OPEN,
          application_deadline: { lte: now },
        },
        data: { status: OpportunityStatus.EXPIRED },
        select: { id: true },
      });
      expect(tx.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          {
            actorId: null,
            action: 'OPPORTUNITY_STATUS_CHANGED',
            entity: 'research_opportunities',
            entityId: id,
            payload: {
              fromStatus: OpportunityStatus.OPEN,
              toStatus: OpportunityStatus.EXPIRED,
              reason: 'APPLICATION_DEADLINE_REACHED',
            },
          },
        ],
      });
    },
  );

  it('keeps an opportunity OPEN before its deadline', async () => {
    const { service, row, tx } = setup(OpportunityStatus.OPEN);
    row.application_deadline = new Date(now.getTime() + 1);
    await expect(service.findOne(actorId, id)).resolves.toMatchObject({
      status: OpportunityStatus.OPEN,
    });
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });

  it.each([
    OpportunityStatus.DRAFT,
    OpportunityStatus.FILLED,
    OpportunityStatus.CLOSED,
    OpportunityStatus.EXPIRED,
  ])('does not expire %s even with an old deadline', async (status) => {
    const { service, row, tx } = setup(status);
    row.application_deadline = new Date(now.getTime() - 1);
    await expect(service.findOne(actorId, id)).resolves.toMatchObject({
      status,
    });
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });

  it('does not duplicate the expiry audit on repeated reads', async () => {
    const { service, row, tx } = setup(OpportunityStatus.OPEN);
    row.application_deadline = now;
    await service.findOne(actorId, id);
    await service.findOne(actorId, id);
    expect(tx.auditLog.createMany).toHaveBeenCalledOnce();
  });

  it('expires records before applying list filters and counting', async () => {
    const { service, row, tx } = setup(OpportunityStatus.OPEN);
    row.application_deadline = now;
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0n }]);
    tx.research_opportunities.findMany.mockResolvedValue([]);
    const query = Object.assign(new ListOpportunitiesQueryDto(), {
      status: OpportunityStatus.OPEN,
    });
    await expect(service.findAll(actorId, query)).resolves.toMatchObject({
      items: [],
      meta: { total: 0 },
    });
    expect(row.status).toBe(OpportunityStatus.EXPIRED);
    expect(
      tx.research_opportunities.updateManyAndReturn,
    ).toHaveBeenCalledBefore(tx.$queryRaw);
    expect(
      tx.research_opportunities.updateManyAndReturn.mock.calls[0][0].where,
    ).not.toHaveProperty('id');
  });

  it('commits automatic expiry before rejecting a fill with 409', async () => {
    const { service, row, tx, prisma } = setup(OpportunityStatus.OPEN);
    row.application_deadline = now;
    await expect(
      service.transitionStatus(actorId, id, 'fill'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(row.status).toBe(OpportunityStatus.EXPIRED);
    await expect(prisma.$transaction.mock.results[0].value).resolves.toBeNull();
    expect(tx.auditLog.createMany).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.research_opportunities.update).not.toHaveBeenCalled();
  });

  it('fails the expiry transaction if its audit insert fails', async () => {
    const { service, row, tx } = setup(OpportunityStatus.OPEN);
    row.application_deadline = now;
    const failure = new Error('Audit unavailable');
    tx.auditLog.createMany.mockRejectedValue(failure);
    await expect(service.findOne(actorId, id)).rejects.toBe(failure);
    expect(tx.research_opportunities.findUnique).not.toHaveBeenCalled();
  });

  it('does not revive an expired opportunity by extending the deadline', async () => {
    const { service, row } = setup(OpportunityStatus.OPEN);
    row.application_deadline = now;
    await expect(
      service.update(actorId, id, {
        applicationDeadline: '2099-01-01T00:00:00Z',
      }),
    ).resolves.toMatchObject({ status: OpportunityStatus.EXPIRED });
  });

  it('expires an OPEN record if PATCH moves its deadline into the past', async () => {
    const { service, tx } = setup(OpportunityStatus.OPEN);
    await expect(
      service.update(actorId, id, {
        applicationDeadline: '2000-01-01T00:00:00Z',
      }),
    ).resolves.toMatchObject({ status: OpportunityStatus.EXPIRED });
    expect(tx.auditLog.createMany).toHaveBeenCalledOnce();
  });
});

describe('Opportunity status HTTP contract', () => {
  let app: INestApplication;
  let fixture: ReturnType<typeof setup>;
  const { request, close } = createHttpTestClient();

  beforeAll(async () => {
    fixture = setup();
    const module = await Test.createTestingModule({
      controllers: [OpportunitiesController],
      providers: [
        { provide: OpportunitiesService, useValue: fixture.service },
        { provide: APP_GUARD, useClass: SessionGuard },
        {
          provide: SESSION_RESOLVER,
          useValue: {
            resolve: vi.fn(async (token: string) =>
              token === 'valid'
                ? {
                    userId: actorId,
                    sessionId: 'session',
                    mustChangePassword: false,
                  }
                : null,
            ),
            refresh: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    close();
    await app?.close();
  });

  it('requires a session for all three action routes', async () => {
    for (const [action] of transitions) {
      await request(app.getHttpServer())
        .post(`/opportunities/${id}/${action}`)
        .expect(401);
    }
  });

  it('validates the path UUID before reaching the service', async () => {
    for (const [action] of transitions) {
      await request(app.getHttpServer())
        .post(`/opportunities/invalid/${action}`)
        .set('Cookie', 'researchos_session=valid')
        .expect(400);
    }
    expect(fixture.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns 200 for each legal action, preserves publication time, and rejects repeats', async () => {
    for (const [action, , to] of transitions) {
      const result = await request(app.getHttpServer())
        .post(`/opportunities/${id}/${action}`)
        .set('Cookie', 'researchos_session=valid')
        .expect(200);
      expect(result.body).toMatchObject({
        status: to,
        publishedAt: publishedAt.toISOString(),
      });
      await request(app.getHttpServer())
        .post(`/opportunities/${id}/${action}`)
        .set('Cookie', 'researchos_session=valid')
        .expect(409);
    }
    expect(fixture.tx.auditLog.create).toHaveBeenCalledTimes(3);
  });
});
