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

/**
 * The applicant join every application read carries.
 *
 * The join is what puts the applicant's name, email, department and avatar
 * on the application, so a list renders without an N+1 walk over the
 * profile endpoints.
 */
const applicantInclude = {
  users_opportunity_applications_applicant_idTousers: {
    include: { researcher_profiles: true },
  },
};

/** A joined applicant, so a mocked row carries the display fields. */
function withApplicant(
  application: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...application,
    users_opportunity_applications_applicant_idTousers: {
      id: actorId,
      full_name: 'Nguyễn Văn A',
      email: 'nguyenvana@fpt.edu.vn',
      department_unit: 'Software Engineering',
      academic_title: 'PGS',
      academic_degree: 'TS',
      user_type: 'FACULTY',
      researcher_profiles: { avatar_storage_key: 'avatars/abc.png' },
      ...overrides,
    },
  };
}

describe('Applications HTTP contract', () => {
  let app: INestApplication;
  const client = createHttpTestClient();
  const request = () => client.request(app.getHttpServer());
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    research_opportunities: { findUnique: vi.fn() },
    group_members: { findUnique: vi.fn() },
    opportunity_applications: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateManyAndReturn: vi.fn(),
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
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
      const text = sql.join('');
      if (text.includes('clock_timestamp')) return [{ now }];
      if (text.includes('can_manage_opportunity')) return [{ allowed: true }];
      if (text.includes('FROM opportunity_applications')) return [row];
      return [];
    });
    tx.research_opportunities.findUnique.mockResolvedValue(opportunity);
    tx.opportunity_applications.findFirst.mockResolvedValue(null);
    tx.opportunity_applications.create.mockResolvedValue(withApplicant(row));
    tx.opportunity_applications.findMany.mockResolvedValue([
      withApplicant({ ...row, research_opportunities: { title: 'A call' } }),
    ]);
    tx.opportunity_applications.count.mockResolvedValue(1);
    tx.opportunity_applications.updateManyAndReturn.mockResolvedValue([row]);
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
      include: applicantInclude,
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
      include: {
        research_opportunities: { select: { title: true } },
        ...applicantInclude,
      },
      orderBy: [{ response_due_at: 'asc' }, { id: 'asc' }],
      skip: 1,
      take: 1,
    });
    expect(response.body.meta).toMatchObject({ page: 2, limit: 1, total: 1 });
  });

  it('returns the applicant display fields the opportunity screen renders', async () => {
    tx.opportunity_applications.findMany.mockResolvedValue([
      withApplicant({ ...row, research_opportunities: { title: 'A call' } }),
    ]);

    const response = await request()
      .get(base)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.items[0]).toMatchObject({
      applicantId: actorId,
      applicantFullName: 'Nguyễn Văn A',
      applicantEmail: 'nguyenvana@fpt.edu.vn',
      applicantDepartmentUnit: 'Software Engineering',
      applicantAvatarStorageKey: 'avatars/abc.png',
    });
  });

  it('lists an applicant without a profile row instead of failing', async () => {
    tx.opportunity_applications.findMany.mockResolvedValue([
      withApplicant(
        { ...row, research_opportunities: { title: 'A call' } },
        { researcher_profiles: null },
      ),
    ]);

    const response = await request()
      .get(base)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.items[0]).toMatchObject({
      applicantFullName: 'Nguyễn Văn A',
      applicantEmail: 'nguyenvana@fpt.edu.vn',
      applicantDepartmentUnit: 'Software Engineering',
      applicantAvatarStorageKey: null,
    });
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

  describe('respond', () => {
    const respondUrl = `/applications/${id}/respond`;

    it('returns the accepted application and existing membership on a retry', async () => {
      const accepted = {
        ...row,
        status: 'ACCEPTED',
        responded_by: actorId,
        responded_at: now,
      };
      const groupId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      tx.$queryRaw
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([{ allowed: true, group_id: groupId }])
        .mockResolvedValueOnce([{ now }])
        .mockResolvedValueOnce([accepted])
        .mockResolvedValueOnce([{ allowed: true, group_id: groupId }])
        .mockResolvedValueOnce([{ now }]);
      tx.opportunity_applications.updateManyAndReturn.mockResolvedValue([
        accepted,
      ]);
      tx.opportunity_applications.findUniqueOrThrow.mockResolvedValue(accepted);
      tx.group_members.findUnique.mockResolvedValue({
        group_id: groupId,
        user_id: row.applicant_id,
        role: 'GROUP_LEADER',
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await request()
          .post(respondUrl)
          .set('Cookie', cookie)
          .send({ decision: 'ACCEPTED' })
          .expect(200);
        expect(response.body).toMatchObject({
          status: 'ACCEPTED',
          membership: {
            groupId,
            userId: row.applicant_id,
            role: 'GROUP_LEADER',
          },
        });
      }
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).toHaveBeenCalledOnce();
    });

    it('still authorizes a retry of an accepted application', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([{ ...row, status: 'ACCEPTED' }])
        .mockResolvedValueOnce([{ allowed: false }]);
      await request()
        .post(respondUrl)
        .set('Cookie', cookie)
        .send({ decision: 'ACCEPTED' })
        .expect(403);
      expect(tx.group_members.findUnique).not.toHaveBeenCalled();
    });

    it('requires authentication and researcher access', async () => {
      await request().post(respondUrl).expect(401);
      resolver.effectiveRoles.mockResolvedValue({
        isResearcher: false,
        isAdmin: true,
      });
      await request().post(respondUrl).set('Cookie', cookie).expect(403);
    });

    it('answers a pending application as the owner and stops its countdown', async () => {
      const answered = {
        ...row,
        status: 'INVITED_TO_DISCUSS',
        response_note: 'Let us meet next week.',
        responded_by: actorId,
        responded_at: now,
      };
      tx.opportunity_applications.updateManyAndReturn.mockResolvedValue([
        answered,
      ]);
      const response = await request()
        .post(respondUrl)
        .set('Cookie', cookie)
        .send({
          decision: 'INVITED_TO_DISCUSS',
          responseNote: '  Let us meet next week.  ',
        })
        .expect(200);
      expect(response.body).toMatchObject({
        id,
        status: 'INVITED_TO_DISCUSS',
        responseNote: 'Let us meet next week.',
        respondedBy: actorId,
        respondedAt: now.toISOString(),
        remainingSeconds: null,
        isOverdue: false,
      });
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).toHaveBeenCalledWith({
        where: { id, status: 'PENDING' },
        data: {
          status: 'INVITED_TO_DISCUSS',
          response_note: 'Let us meet next week.',
          responded_by: actorId,
        },
        include: applicantInclude,
      });
    });

    it('declines a pending application and leaves the responder unset otherwise', async () => {
      tx.opportunity_applications.updateManyAndReturn.mockResolvedValue([
        {
          ...row,
          status: 'DECLINED',
          responded_by: actorId,
          responded_at: now,
        },
      ]);
      await request()
        .post(respondUrl)
        .set('Cookie', cookie)
        .send({ decision: 'DECLINED' })
        .expect(200);
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).toHaveBeenCalledWith({
        where: { id, status: 'PENDING' },
        data: {
          status: 'DECLINED',
          response_note: null,
          responded_by: actorId,
        },
        include: applicantInclude,
      });
    });

    it('stores a blank note as no note at all', async () => {
      tx.opportunity_applications.updateManyAndReturn.mockResolvedValue([
        {
          ...row,
          status: 'DECLINED',
          responded_by: actorId,
          responded_at: now,
        },
      ]);
      await request()
        .post(respondUrl)
        .set('Cookie', cookie)
        .send({ decision: 'DECLINED', responseNote: '   ' })
        .expect(200);
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).toHaveBeenCalledWith({
        where: { id, status: 'PENDING' },
        data: {
          status: 'DECLINED',
          response_note: null,
          responded_by: actorId,
        },
        include: applicantInclude,
      });
    });

    it('returns 404 for an application that does not exist', async () => {
      tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
        const text = sql.join('');
        if (text.includes('FROM opportunity_applications')) return [];
        return [{ allowed: true }];
      });
      const response = await request()
        .post(respondUrl)
        .set('Cookie', cookie)
        .send({ decision: 'DECLINED' })
        .expect(404);
      expect(response.body.message).toBe('application_not_found');
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).not.toHaveBeenCalled();
    });

    it('returns 403 when the caller cannot manage the opportunity', async () => {
      tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
        const text = sql.join('');
        if (text.includes('can_manage_opportunity'))
          return [{ allowed: false }];
        if (text.includes('FROM opportunity_applications')) return [row];
        return [{ now }];
      });
      const response = await request()
        .post(respondUrl)
        .set('Cookie', cookie)
        .send({ decision: 'DECLINED' })
        .expect(403);
      expect(response.body.message).toBe('application_access_denied');
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).not.toHaveBeenCalled();
    });

    it('returns 409 for an application that was already answered or withdrawn', async () => {
      for (const [status, code] of [
        ['INVITED_TO_DISCUSS', 'application_already_answered'],
        ['DECLINED', 'application_already_answered'],
        ['WITHDRAWN', 'application_already_withdrawn'],
      ] as const) {
        tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
          const text = sql.join('');
          if (text.includes('FROM opportunity_applications'))
            return [{ ...row, status }];
          return [{ allowed: true }];
        });
        const response = await request()
          .post(respondUrl)
          .set('Cookie', cookie)
          .send({ decision: 'DECLINED' })
          .expect(409);
        expect(response.body.message).toBe(code);
      }
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).not.toHaveBeenCalled();
    });

    it('returns 409 when another transaction answered the application first', async () => {
      tx.opportunity_applications.updateManyAndReturn.mockResolvedValue([]);
      const response = await request()
        .post(respondUrl)
        .set('Cookie', cookie)
        .send({ decision: 'DECLINED' })
        .expect(409);
      expect(response.body.message).toBe('application_already_answered');
    });

    it('maps a trigger refusal to 409 on an invalid state', async () => {
      tx.opportunity_applications.updateManyAndReturn.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Only pending application can transition once',
          {
            code: 'P2039',
            clientVersion: 'test',
            meta: {
              driverAdapterError: {
                cause: {
                  originalCode: '23514',
                  originalMessage:
                    'new row for relation "opportunity_applications" violates check constraint "ck_application_response"',
                },
              },
            },
          },
        ),
      );
      const response = await request()
        .post(respondUrl)
        .set('Cookie', cookie)
        .send({ decision: 'DECLINED' })
        .expect(409);
      expect(response.body.message).toBe('application_invalid_state');
    });

    it('rejects a malformed answer', async () => {
      for (const body of [
        {},
        { decision: 'PENDING' },
        { decision: 'WITHDRAWN' },
        { decision: 'INVITED_TO_DISCUSS', responseNote: 'x'.repeat(10001) },
        { decision: 'INVITED_TO_DISCUSS', status: 'DECLINED' },
      ]) {
        await request()
          .post(respondUrl)
          .set('Cookie', cookie)
          .send(body)
          .expect(400);
      }
      await request()
        .post('/applications/not-a-uuid/respond')
        .set('Cookie', cookie)
        .send({ decision: 'DECLINED' })
        .expect(400);
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    const withdrawUrl = `/applications/${id}/withdraw`;

    it('requires authentication and researcher access', async () => {
      await request().post(withdrawUrl).expect(401);
      resolver.effectiveRoles.mockResolvedValue({
        isResearcher: false,
        isAdmin: true,
      });
      await request().post(withdrawUrl).set('Cookie', cookie).expect(403);
    });

    it('withdraws the caller own pending application and keeps the row', async () => {
      tx.opportunity_applications.updateManyAndReturn.mockResolvedValue([
        { ...row, status: 'WITHDRAWN', withdrawn_at: now },
      ]);
      const response = await request()
        .post(withdrawUrl)
        .set('Cookie', cookie)
        .expect(200);
      expect(response.body).toMatchObject({
        id,
        status: 'WITHDRAWN',
        withdrawnAt: now.toISOString(),
        remainingSeconds: null,
        isOverdue: false,
      });
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).toHaveBeenCalledWith({
        where: { id, status: 'PENDING' },
        data: { status: 'WITHDRAWN' },
        include: applicantInclude,
      });
    });

    it('returns 404 for an application that does not exist', async () => {
      tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
        const text = sql.join('');
        if (text.includes('FROM opportunity_applications')) return [];
        return [{ now }];
      });
      const response = await request()
        .post(withdrawUrl)
        .set('Cookie', cookie)
        .expect(404);
      expect(response.body.message).toBe('application_not_found');
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).not.toHaveBeenCalled();
    });

    it('returns 403 when the application belongs to another researcher', async () => {
      tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
        const text = sql.join('');
        if (text.includes('FROM opportunity_applications'))
          return [{ ...row, applicant_id: otherId }];
        return [{ now }];
      });
      const response = await request()
        .post(withdrawUrl)
        .set('Cookie', cookie)
        .expect(403);
      expect(response.body.message).toBe('application_access_denied');
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).not.toHaveBeenCalled();
    });

    it('returns 409 when the application was already withdrawn or answered', async () => {
      for (const [status, code] of [
        ['WITHDRAWN', 'application_already_withdrawn'],
        ['INVITED_TO_DISCUSS', 'application_already_answered'],
        ['DECLINED', 'application_already_answered'],
      ] as const) {
        tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
          const text = sql.join('');
          if (text.includes('FROM opportunity_applications'))
            return [{ ...row, status }];
          return [{ now }];
        });
        const response = await request()
          .post(withdrawUrl)
          .set('Cookie', cookie)
          .expect(409);
        expect(response.body.message).toBe(code);
      }
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).not.toHaveBeenCalled();
    });

    it('returns 409 when another transaction withdrew the application first', async () => {
      tx.opportunity_applications.updateManyAndReturn.mockResolvedValue([]);
      const response = await request()
        .post(withdrawUrl)
        .set('Cookie', cookie)
        .expect(409);
      expect(response.body.message).toBe('application_already_withdrawn');
    });

    it('rejects an invalid application id', async () => {
      await request()
        .post('/applications/not-a-uuid/withdraw')
        .set('Cookie', cookie)
        .expect(400);
      expect(
        tx.opportunity_applications.updateManyAndReturn,
      ).not.toHaveBeenCalled();
    });
  });
});
