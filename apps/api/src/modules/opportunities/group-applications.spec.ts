import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@researchos/database';
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
const groupId = '10000000-0000-4000-8000-000000000002';
const opportunityId = '10000000-0000-4000-8000-000000000003';
const applicationId = '10000000-0000-4000-8000-000000000004';
const base = `/research-groups/${groupId}/applications`;
const cookie = 'researchos_session=valid';
const now = new Date('2026-11-12T00:00:00Z');

const application = {
  id: applicationId,
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
  research_opportunities: { title: 'PhD position' },
};

describe('Group applications HTTP contract', () => {
  let app: INestApplication;
  const client = createHttpTestClient();
  const request = () => client.request(app.getHttpServer());
  const tx = {
    $queryRaw: vi.fn(),
    research_groups: { findUnique: vi.fn() },
    opportunity_applications: {
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

  /**
   * The service reads the group scope in one query and the manageable
   * opportunities in another; the clock is a third.
   */
  function mockScope(groupTotal: number, manageable: number) {
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
      const text = sql.join('');
      if (text.includes('clock_timestamp')) return [{ now }];
      if (text.includes('group_total'))
        return [
          { group_total: BigInt(groupTotal), manageable: BigInt(manageable) },
        ];
      if (text.includes('SELECT o.id'))
        return manageable > 0 ? [{ id: opportunityId }] : [];
      return [];
    });
  }

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
    tx.research_groups.findUnique.mockResolvedValue({ id: groupId });
    tx.opportunity_applications.findMany.mockResolvedValue([application]);
    tx.opportunity_applications.count.mockResolvedValue(1);
    mockScope(1, 1);
  });

  afterAll(async () => {
    client.close();
    await app?.close();
  });

  it('requires a session and researcher access', async () => {
    await request().get(base).expect(401);
    resolver.effectiveRoles.mockResolvedValue({
      isResearcher: false,
      isAdmin: true,
    });
    await request().get(base).set('Cookie', cookie).expect(403);
  });

  it('returns the group applications with the opportunity identity and the countdown', async () => {
    const response = await request()
      .get(base)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.items[0]).toMatchObject({
      id: applicationId,
      opportunityId,
      opportunityTitle: 'PhD position',
      countdownAsOf: now.toISOString(),
      remainingSeconds: 259200,
      isOverdue: false,
    });
    expect(response.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it('scopes the page to the opportunities the caller may manage', async () => {
    await request().get(base).set('Cookie', cookie).expect(200);
    expect(tx.opportunity_applications.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { opportunity_id: { in: [opportunityId] } },
        orderBy: [{ applied_at: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('returns 404 for a group that does not exist', async () => {
    tx.research_groups.findUnique.mockResolvedValue(null);
    await request().get(base).set('Cookie', cookie).expect(404);
    expect(tx.opportunity_applications.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller may manage none of the group opportunities', async () => {
    mockScope(2, 0);
    await request().get(base).set('Cookie', cookie).expect(403);
    expect(tx.opportunity_applications.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty page for a group without opportunities', async () => {
    mockScope(0, 0);
    const response = await request()
      .get(base)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.meta).toMatchObject({ total: 0 });
    expect(tx.opportunity_applications.findMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed group id and an unsupported sort', async () => {
    await request()
      .get('/research-groups/not-a-uuid/applications')
      .set('Cookie', cookie)
      .expect(400);
    await request()
      .get(`${base}?sort=unknown`)
      .set('Cookie', cookie)
      .expect(400);
  });
});
