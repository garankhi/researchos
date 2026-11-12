import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaService } from '@researchos/database';
import cookieParser from 'cookie-parser';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createHttpTestClient } from '../../../test/http-test-client.js';
import { SESSION_RESOLVER } from '../../common/auth/session-resolver.js';
import { SessionGuard } from '../../common/guards/session.guard.js';
import { RoleGuard } from '../../common/guards/role.guard.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';

const actorId = '10000000-0000-4000-8000-000000000001';
const opportunityId = '10000000-0000-4000-8000-000000000002';
const id = '10000000-0000-4000-8000-000000000003';
const otherId = '10000000-0000-4000-8000-000000000004';
const base = `/opportunities/${opportunityId}/applications`;
const cookie = 'researchos_session=valid';
const now = new Date('2026-11-12T00:00:00Z');
const opportunity = {
  id: opportunityId,
  creator_id: otherId,
  status: 'OPEN',
  archived_at: null,
  application_deadline: new Date('2026-12-01T00:00:00Z'),
  response_sla_days: 3,
};
const row = {
  id,
  opportunity_id: opportunityId,
  applicant_id: actorId,
  applicant_note: 'Research interest',
  status: 'PENDING',
  response_note: null,
  responded_by: null,
  applied_at: now,
  response_due_at: new Date('2026-11-15T00:00:00Z'),
  responded_at: null,
  withdrawn_at: null,
};

describe('Applications HTTP contract', () => {
  let app: INestApplication;
  const client = createHttpTestClient();
  const request = () => client.request(app.getHttpServer());
  const tx = {
    $queryRaw: vi.fn(),
    research_opportunities: { findUnique: vi.fn() },
    opportunity_applications: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
  const prisma = { $transaction: vi.fn() };
  const resolver = {
    resolve: vi.fn(),
    refresh: vi.fn(),
    effectiveRoles: vi.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SESSION_RESOLVER, useValue: resolver },
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: RoleGuard },
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
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    resolver.resolve.mockResolvedValue({
      userId: actorId,
      sessionId: 'test',
      mustChangePassword: false,
    });
    resolver.refresh.mockResolvedValue(undefined);
    resolver.effectiveRoles.mockResolvedValue({
      isResearcher: true,
      isAdmin: false,
    });
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) =>
      sql.join('').includes('clock_timestamp')
        ? [{ now }]
        : [{ allowed: true }],
    );
    tx.research_opportunities.findUnique.mockResolvedValue(opportunity);
    tx.opportunity_applications.findFirst.mockResolvedValue(null);
    tx.opportunity_applications.create.mockResolvedValue(row);
    tx.opportunity_applications.findMany.mockResolvedValue([row]);
    tx.opportunity_applications.count.mockResolvedValue(1);
  });
  afterAll(async () => {
    client.close();
    await app?.close();
  });

  it('requires authentication and researcher access on all three routes', async () => {
    for (const [method, path] of [
      ['post', base],
      ['get', base],
      ['get', '/my/applications'],
    ] as const) {
      await request()[method](path).expect(401);
      resolver.effectiveRoles.mockResolvedValue({
        isResearcher: false,
        isAdmin: true,
      });
      await request()[method](path).set('Cookie', cookie).expect(403);
    }
  });

  it('applies with caller identity and returns the persisted SLA snapshot plus database-clock countdown', async () => {
    const response = await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ applicantNote: ' Research interest ' })
      .expect(201);
    expect(response.body).toMatchObject({
      applicantId: actorId,
      appliedAt: now.toISOString(),
      responseDueAt: row.response_due_at.toISOString(),
      countdownAsOf: now.toISOString(),
      remainingSeconds: 259200,
      isOverdue: false,
    });
    expect(tx.opportunity_applications.create).toHaveBeenCalledWith({
      data: {
        opportunity_id: opportunityId,
        applicant_id: actorId,
        applicant_note: 'Research interest',
        response_due_at: row.response_due_at,
      },
    });
  });

  it('returns 409 for every non-open, expired or archived opportunity', async () => {
    for (const change of [
      { status: 'DRAFT' },
      { status: 'FILLED' },
      { status: 'CLOSED' },
      { status: 'EXPIRED' },
      { archived_at: now },
      { application_deadline: now },
      { application_deadline: null },
    ]) {
      tx.research_opportunities.findUnique.mockResolvedValue({
        ...opportunity,
        ...change,
      });
      await request()
        .post(base)
        .set('Cookie', cookie)
        .send({ applicantNote: 'Interest' })
        .expect(409);
    }
    expect(tx.opportunity_applications.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent opportunity and 403 for self-application', async () => {
    tx.research_opportunities.findUnique.mockResolvedValue(null);
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ applicantNote: 'Interest' })
      .expect(404);
    tx.research_opportunities.findUnique.mockResolvedValue({
      ...opportunity,
      creator_id: actorId,
    });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ applicantNote: 'Interest' })
      .expect(403);
  });

  it('rejects repeat applications in any status, including withdrawal', async () => {
    for (const status of [
      'PENDING',
      'INVITED_TO_DISCUSS',
      'DECLINED',
      'WITHDRAWN',
    ]) {
      tx.opportunity_applications.findFirst.mockResolvedValue({
        ...row,
        status,
      });
      await request()
        .post(base)
        .set('Cookie', cookie)
        .send({ applicantNote: 'Again' })
        .expect(409);
    }
    expect(tx.opportunity_applications.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent duplicate or deadline-trigger rejection to 409', async () => {
    for (const error of [
      new Prisma.PrismaClientKnownRequestError('Duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
      new Prisma.PrismaClientKnownRequestError('Deadline race', {
        code: 'P2039',
        clientVersion: 'test',
        meta: {
          driverAdapterError: {
            cause: {
              originalCode: '23514',
              originalMessage: 'Opportunity closed',
            },
          },
        },
      }),
    ]) {
      tx.opportunity_applications.create.mockRejectedValue(error);
      await request()
        .post(base)
        .set('Cookie', cookie)
        .send({ applicantNote: 'Interest' })
        .expect(409);
    }
  });

  it('restricts the received list through the canonical management policy, returning 403 to nonowners', async () => {
    tx.$queryRaw.mockResolvedValue([{ allowed: false }]);
    await request().get(base).set('Cookie', cookie).expect(403);
    expect(tx.opportunity_applications.findMany).not.toHaveBeenCalled();
    tx.$queryRaw.mockResolvedValue([]);
    await request().get(base).set('Cookie', cookie).expect(404);
  });

  it('returns the owner received list with bounded paging and deterministic sorting', async () => {
    const response = await request()
      .get(`${base}?page=2&limit=1&sort=responseDueAt`)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.items[0].opportunityId).toBe(opportunityId);
    expect(tx.opportunity_applications.findMany).toHaveBeenCalledWith({
      where: { opportunity_id: opportunityId },
      orderBy: [{ response_due_at: 'asc' }, { id: 'asc' }],
      skip: 1,
      take: 1,
    });
    expect(response.body.meta).toMatchObject({ page: 2, limit: 1, total: 1 });
  });

  it('scopes my applications to the caller and computes one countdown time for the page', async () => {
    const response = await request()
      .get('/my/applications')
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.items[0].countdownAsOf).toBe(now.toISOString());
    expect(tx.opportunity_applications.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { applicant_id: actorId } }),
    );
  });

  it('clamps overdue pending countdowns to zero and marks them overdue', async () => {
    tx.opportunity_applications.findMany.mockResolvedValue([
      { ...row, response_due_at: now },
    ]);
    const response = await request()
      .get('/my/applications')
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.items[0]).toMatchObject({
      remainingSeconds: 0,
      isOverdue: true,
    });
  });

  it('stops countdowns for responses and withdrawals without changing stored deadlines', async () => {
    tx.opportunity_applications.findMany.mockResolvedValue(
      ['INVITED_TO_DISCUSS', 'DECLINED', 'WITHDRAWN'].map((status) => ({
        ...row,
        status,
      })),
    );
    const response = await request()
      .get('/my/applications')
      .set('Cookie', cookie)
      .expect(200);
    for (const item of response.body.items)
      expect(item).toMatchObject({
        remainingSeconds: null,
        isOverdue: false,
        responseDueAt: row.response_due_at.toISOString(),
      });
  });

  it('rejects malformed inputs and attempts to set applicant, status or SLA timestamps', async () => {
    for (const body of [
      {},
      { applicantNote: null },
      { applicantNote: '   ' },
      { applicantNote: 'x'.repeat(10001) },
      { applicantNote: 'Valid', applicantId: otherId },
      { applicantNote: 'Valid', status: 'PENDING' },
      { applicantNote: 'Valid', responseDueAt: now.toISOString() },
    ]) {
      await request().post(base).set('Cookie', cookie).send(body).expect(400);
    }
    await request()
      .post('/opportunities/bad/applications')
      .set('Cookie', cookie)
      .send({ applicantNote: 'Valid' })
      .expect(400);
    for (const query of [
      'page=0',
      'limit=101',
      'sort=unknown',
      `applicantId=${otherId}`,
    ])
      await request()
        .get(`/my/applications?${query}`)
        .set('Cookie', cookie)
        .expect(400);
    expect(tx.opportunity_applications.create).not.toHaveBeenCalled();
  });
});
