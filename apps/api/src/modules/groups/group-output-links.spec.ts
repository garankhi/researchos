import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { GroupOutputStatus, PrismaService } from '@researchos/database';
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
import { GroupOutputLinksController } from './group-output-links.controller.js';
import { GroupOutputLinksService } from './group-output-links.service.js';

const actorId = '10000000-0000-4000-8000-000000000001';
const groupId = '10000000-0000-4000-8000-000000000002';
const outputId = '10000000-0000-4000-8000-000000000003';
const revisionId = '10000000-0000-4000-8000-000000000004';
const otherRevisionId = '10000000-0000-4000-8000-000000000005';
const base = `/research-groups/${groupId}/outputs`;
const cookie = 'researchos_session=valid';
const now = new Date('2026-11-12T00:00:00Z');

/**
 * The policy the database reports for the caller, group and output.
 */
const policy = {
  group_exists: true,
  is_researcher: true,
  can_manage_group: true,
  is_member: true,
  can_view: true,
  can_manage_output: true,
  sharing_status: 'SHARED',
  revision_released: true,
};

const pendingLink = {
  output_id: outputId,
  group_id: groupId,
  requested_revision_id: revisionId,
  requested_by: actorId,
  requested_at: now,
  status: GroupOutputStatus.PENDING,
  decided_by: null,
  decided_at: null,
  decision_note: null,
  accepted_revision_id: null,
  accepted_by: null,
  accepted_at: null,
  removed_by: null,
  removed_at: null,
};

const acceptedLink = {
  ...pendingLink,
  status: GroupOutputStatus.ACCEPTED,
  decided_by: actorId,
  decided_at: now,
  accepted_revision_id: revisionId,
  accepted_by: actorId,
  accepted_at: now,
};

describe('Group output links HTTP contract', () => {
  let app: INestApplication;
  const client = createHttpTestClient();
  const request = () => client.request(app.getHttpServer());
  const tx = {
    $queryRaw: vi.fn(),
    group_output_links: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const prisma = { $transaction: vi.fn() };
  const resolver = {
    resolve: vi.fn(),
    refresh: vi.fn(),
    effectiveRoles: vi.fn(),
  };

  function mockPolicy(overrides: Partial<typeof policy> = {}) {
    const merged = { ...policy, ...overrides };
    tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
      const text = sql.join('');
      if (text.includes('clock_timestamp')) return [{ now }];
      // The list route reads only the group and the membership.
      if (text.includes('group_exists') && !text.includes('can_manage_group'))
        return [
          {
            group_exists: merged.group_exists,
            is_member: merged.is_member,
          },
        ];
      return [merged];
    });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GroupOutputLinksController],
      providers: [
        GroupOutputLinksService,
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
    tx.group_output_links.findUnique.mockResolvedValue(null);
    tx.group_output_links.findMany.mockResolvedValue([pendingLink]);
    tx.group_output_links.count.mockResolvedValue(1);
    tx.group_output_links.create.mockImplementation(async ({ data }) => ({
      ...pendingLink,
      ...data,
    }));
    tx.group_output_links.update.mockImplementation(async ({ data }) => ({
      ...pendingLink,
      ...data,
    }));
    mockPolicy();
  });

  afterAll(async () => {
    client.close();
    await app?.close();
  });

  it('requires a session on every route and researcher access on the writes', async () => {
    for (const [method, path] of [
      ['get', base],
      ['post', base],
      ['patch', `${base}/${outputId}`],
      ['delete', `${base}/${outputId}`],
    ] as const) {
      await request()[method](path).expect(401);
      if (method === 'get') continue;
      resolver.effectiveRoles.mockResolvedValue({
        isResearcher: false,
        isAdmin: true,
      });
      await request()[method](path).set('Cookie', cookie).expect(403);
    }
  });

  it('lists the group links for a member', async () => {
    const response = await request()
      .get(base)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.items[0]).toMatchObject({
      outputId,
      groupId,
      status: GroupOutputStatus.PENDING,
      requestedRevisionId: revisionId,
    });
    expect(response.body.meta).toMatchObject({ total: 1 });
  });

  it('refuses the link list to an outsider and 404s a missing group', async () => {
    mockPolicy({ is_member: false });
    await request().get(base).set('Cookie', cookie).expect(403);
    mockPolicy({ group_exists: false });
    await request().get(base).set('Cookie', cookie).expect(404);
  });

  it('requests a pending link for a member who does not own the work', async () => {
    mockPolicy({ can_manage_group: false, can_manage_output: false });
    const response = await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(201);
    expect(response.body.status).toBe(GroupOutputStatus.PENDING);
    expect(tx.group_output_links.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        output_id: outputId,
        group_id: groupId,
        requested_revision_id: revisionId,
        status: GroupOutputStatus.PENDING,
        decided_by: null,
        accepted_revision_id: null,
      }),
    });
  });

  it('accepts the link outright when the caller manages the group and owns the work', async () => {
    const response = await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(201);
    expect(response.body.status).toBe(GroupOutputStatus.ACCEPTED);
    expect(tx.group_output_links.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: GroupOutputStatus.ACCEPTED,
        accepted_revision_id: revisionId,
        accepted_by: actorId,
      }),
    });
  });

  it('refuses a request for an unreleased revision or an unshared work', async () => {
    mockPolicy({ revision_released: false });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(400);
    mockPolicy({ sharing_status: 'DRAFT' });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(409);
    mockPolicy({ sharing_status: null });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(404);
  });

  it('refuses a request from a caller who is not a member or cannot see the work', async () => {
    mockPolicy({ is_member: false });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(403);
    mockPolicy({ can_view: false });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(403);
    expect(tx.group_output_links.create).not.toHaveBeenCalled();
  });

  it('preserves the accepted pin when a new revision is requested', async () => {
    tx.group_output_links.findUnique.mockResolvedValue(acceptedLink);
    mockPolicy({ can_manage_group: false, can_manage_output: false });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId: otherRevisionId })
      .expect(201);
    const data = tx.group_output_links.update.mock.calls[0][0].data;
    expect(data.status).toBe(GroupOutputStatus.PENDING);
    expect(data.requested_revision_id).toBe(otherRevisionId);
    // The pin is untouched: only a fresh acceptance replaces it.
    expect(data.accepted_revision_id).toBeUndefined();
  });

  it('reports a duplicate request as a conflict', async () => {
    tx.group_output_links.findUnique.mockResolvedValue(acceptedLink);
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(409);
    tx.group_output_links.findUnique.mockResolvedValue(pendingLink);
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ outputId, revisionId })
      .expect(409);
  });

  it('lets the group lead accept a pending request', async () => {
    tx.group_output_links.findUnique.mockResolvedValue(pendingLink);
    const response = await request()
      .patch(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .send({ status: GroupOutputStatus.ACCEPTED, decisionNote: 'Relevant' })
      .expect(200);
    expect(response.body.status).toBe(GroupOutputStatus.ACCEPTED);
    expect(tx.group_output_links.update).toHaveBeenCalledWith({
      where: { output_id_group_id: { output_id: outputId, group_id: groupId } },
      data: expect.objectContaining({
        status: GroupOutputStatus.ACCEPTED,
        decided_by: actorId,
        accepted_revision_id: revisionId,
      }),
    });
  });

  it('lets the group lead reject a pending request without touching the pin', async () => {
    tx.group_output_links.findUnique.mockResolvedValue(pendingLink);
    await request()
      .patch(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .send({ status: GroupOutputStatus.REJECTED })
      .expect(200);
    const data = tx.group_output_links.update.mock.calls[0][0].data;
    expect(data.status).toBe(GroupOutputStatus.REJECTED);
    expect(data.accepted_revision_id).toBeUndefined();
  });

  it('refuses a decision by anybody but the group lead', async () => {
    mockPolicy({ can_manage_group: false });
    tx.group_output_links.findUnique.mockResolvedValue(pendingLink);
    await request()
      .patch(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .send({ status: GroupOutputStatus.ACCEPTED })
      .expect(403);
    expect(tx.group_output_links.update).not.toHaveBeenCalled();
  });

  it('refuses a decision on a link that was already decided', async () => {
    tx.group_output_links.findUnique.mockResolvedValue(acceptedLink);
    await request()
      .patch(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .send({ status: GroupOutputStatus.ACCEPTED })
      .expect(409);
  });

  it('removes an accepted link as a status transition, not a row delete', async () => {
    tx.group_output_links.findUnique.mockResolvedValue(acceptedLink);
    const response = await request()
      .delete(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.status).toBe(GroupOutputStatus.REMOVED);
    expect(tx.group_output_links.update).toHaveBeenCalledWith({
      where: { output_id_group_id: { output_id: outputId, group_id: groupId } },
      data: expect.objectContaining({
        status: GroupOutputStatus.REMOVED,
        removed_by: actorId,
        accepted_revision_id: null,
      }),
    });
    expect(tx.group_output_links.delete).toBeUndefined();
  });

  it('refuses a removal by anybody but the group lead, or of a link that is not accepted', async () => {
    mockPolicy({ can_manage_group: false });
    tx.group_output_links.findUnique.mockResolvedValue(acceptedLink);
    await request()
      .delete(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .expect(403);
    mockPolicy();
    tx.group_output_links.findUnique.mockResolvedValue(pendingLink);
    await request()
      .delete(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .expect(409);
  });

  it('returns 404 for a link that does not exist', async () => {
    tx.group_output_links.findUnique.mockResolvedValue(null);
    await request()
      .patch(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .send({ status: GroupOutputStatus.ACCEPTED })
      .expect(404);
    await request()
      .delete(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('rejects malformed payloads and identifiers', async () => {
    for (const body of [
      {},
      { outputId: 'bad' },
      { revisionId: 'bad' },
      { outputId, revisionId, status: 'PENDING' },
      { outputId, revisionId, removedAt: now.toISOString() },
    ]) {
      await request().post(base).set('Cookie', cookie).send(body).expect(400);
    }
    await request()
      .patch(`${base}/${outputId}`)
      .set('Cookie', cookie)
      .send({ status: 'REMOVED' })
      .expect(400);
    await request().delete(`${base}/bad`).set('Cookie', cookie).expect(400);
    expect(tx.group_output_links.create).not.toHaveBeenCalled();
  });
});
