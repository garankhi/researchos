import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { GroupMemberRole, Prisma, PrismaService } from '@researchos/database';
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
import { GroupDirectionsController } from './group-directions.controller.js';
import { GroupDirectionsService } from './group-directions.service.js';

const actorId = '10000000-0000-4000-8000-000000000001';
const groupId = '10000000-0000-4000-8000-000000000002';
const directionId = '10000000-0000-4000-8000-000000000003';
const topicId = '10000000-0000-4000-8000-000000000004';
const otherId = '10000000-0000-4000-8000-000000000005';
const base = `/research-groups/${groupId}/directions`;
const cookie = 'researchos_session=valid';
const group = {
  id: groupId,
  lead_id: actorId,
  is_active: true,
  archived_at: null,
};
const row = {
  id: directionId,
  group_id: groupId,
  topic_id: null,
  title: 'Systems',
  description: null,
  created_at: new Date('2026-11-01T00:00:00Z'),
  research_topics: null,
};

describe('Group directions HTTP contract', () => {
  let app: INestApplication;
  const client = createHttpTestClient();
  const request = () => client.request(app.getHttpServer());
  const tx = {
    $queryRaw: vi.fn(),
    research_groups: { findUnique: vi.fn() },
    group_members: { findUnique: vi.fn() },
    research_topics: { findUnique: vi.fn() },
    group_directions: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
      controllers: [GroupDirectionsController],
      providers: [
        GroupDirectionsService,
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
      sessionId: 'session',
      mustChangePassword: false,
    });
    resolver.refresh.mockResolvedValue(undefined);
    resolver.effectiveRoles.mockResolvedValue({
      isResearcher: true,
      isAdmin: false,
    });
    tx.$queryRaw.mockResolvedValue([]);
    tx.research_groups.findUnique.mockResolvedValue(group);
    tx.group_members.findUnique.mockResolvedValue(null);
    tx.research_topics.findUnique.mockResolvedValue({ is_active: true });
    tx.group_directions.findMany.mockResolvedValue([row]);
    tx.group_directions.count.mockResolvedValue(1);
    tx.group_directions.findUnique.mockResolvedValue(row);
    tx.group_directions.create.mockImplementation(async ({ data }) => ({
      ...row,
      ...data,
    }));
    tx.group_directions.update.mockImplementation(async ({ data }) => ({
      ...row,
      ...data,
    }));
    tx.group_directions.delete.mockResolvedValue(row);
  });
  afterAll(async () => {
    client.close();
    await app?.close();
  });

  it('requires a session for all routes and researcher access for mutations', async () => {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const path = ['patch', 'delete'].includes(method)
        ? `${base}/${directionId}`
        : base;
      await request()[method](path).expect(401);
      if (method !== 'get') {
        resolver.effectiveRoles.mockResolvedValue({
          isResearcher: false,
          isAdmin: true,
        });
        await request()[method](path).set('Cookie', cookie).expect(403);
      }
    }
  });

  it('publishes immediately with an optional topic and trimmed title', async () => {
    const response = await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ title: ' Systems ' })
      .expect(201);
    expect(response.body).toMatchObject({
      groupId,
      title: 'Systems',
      topicPath: null,
      createdAt: row.created_at.toISOString(),
    });
  });

  it('allows group leaders to publish, but forbids their edit/delete operations', async () => {
    tx.research_groups.findUnique.mockResolvedValue({
      ...group,
      lead_id: otherId,
    });
    tx.group_members.findUnique.mockResolvedValue({
      role: GroupMemberRole.GROUP_LEADER,
    });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ title: 'Core direction' })
      .expect(201);
    await request()
      .patch(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .send({ title: 'Changed' })
      .expect(403);
    await request()
      .delete(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .expect(403);
  });

  it('forbids publishing by plain members, outsiders and unrelated admins', async () => {
    tx.research_groups.findUnique.mockResolvedValue({
      ...group,
      lead_id: otherId,
    });
    for (const member of [null, { role: GroupMemberRole.MEMBER }]) {
      tx.group_members.findUnique.mockResolvedValue(member);
      await request()
        .post(base)
        .set('Cookie', cookie)
        .send({ title: 'Attempt' })
        .expect(403);
    }
    expect(tx.group_directions.create).not.toHaveBeenCalled();
  });

  it('returns full field/subfield/topic paths and pagination to authenticated readers', async () => {
    tx.group_directions.findMany.mockResolvedValue([
      {
        ...row,
        topic_id: topicId,
        research_topics: {
          id: topicId,
          name: 'Topic',
          research_subfields: {
            id: 'subfield',
            name: 'Subfield',
            research_fields: { id: 'field', name: 'Field' },
          },
        },
      },
    ]);
    const response = await request()
      .get(`${base}?page=2&limit=1&sort=title`)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body.items[0].topicPath).toEqual({
      topic: { id: topicId, name: 'Topic' },
      subfield: { id: 'subfield', name: 'Subfield' },
      field: { id: 'field', name: 'Field' },
    });
    expect(tx.group_directions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { group_id: groupId },
        skip: 1,
        take: 1,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('restricts archived group reads to members and refuses mutations', async () => {
    tx.research_groups.findUnique.mockResolvedValue({
      ...group,
      lead_id: otherId,
      archived_at: new Date(),
    });
    await request().get(base).set('Cookie', cookie).expect(403);
    tx.group_members.findUnique.mockResolvedValue({
      role: GroupMemberRole.MEMBER,
    });
    await request().get(base).set('Cookie', cookie).expect(200);
    tx.research_groups.findUnique.mockResolvedValue({
      ...group,
      is_active: false,
    });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ title: 'Archived' })
      .expect(409);
  });

  it('returns 404 for a missing group, direction, or taxonomy topic', async () => {
    tx.research_groups.findUnique.mockResolvedValue(null);
    await request().get(base).set('Cookie', cookie).expect(404);
    tx.research_groups.findUnique.mockResolvedValue(group);
    tx.group_directions.findUnique.mockResolvedValue(null);
    await request()
      .patch(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .send({ title: 'Missing' })
      .expect(404);
    tx.research_topics.findUnique.mockResolvedValue(null);
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ title: 'Topic', topicId })
      .expect(404);
  });

  it('rejects inactive topics when publishing or changing the topic link', async () => {
    tx.research_topics.findUnique.mockResolvedValue({ is_active: false });
    await request()
      .post(base)
      .set('Cookie', cookie)
      .send({ title: 'Topic', topicId })
      .expect(400);
    await request()
      .patch(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .send({ topicId })
      .expect(400);
  });

  it('scopes edits/deletes to both group and direction and supports clearing optional fields', async () => {
    await request()
      .patch(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .send({ topicId: null, description: null })
      .expect(200);
    expect(tx.group_directions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_group_id: { id: directionId, group_id: groupId } },
        data: { topic_id: null, description: null, title: undefined },
      }),
    );
    await request()
      .delete(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(tx.group_directions.delete).toHaveBeenCalledWith({
      where: { id_group_id: { id: directionId, group_id: groupId } },
    });
  });

  it('returns 409 when deleting a direction referenced by a project', async () => {
    tx.group_directions.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Referenced', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );
    await request()
      .delete(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .expect(409);
  });

  it('rejects invalid UUIDs, pagination, sort, titles and protected fields', async () => {
    for (const body of [
      {},
      { title: null },
      { title: '   ' },
      { title: 'x'.repeat(256) },
      { title: 'Valid', groupId: otherId },
      { title: 'Valid', topicId: 'bad' },
    ]) {
      await request().post(base).set('Cookie', cookie).send(body).expect(400);
    }
    await request()
      .patch(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .send({ title: null })
      .expect(400);
    await request().delete(`${base}/bad`).set('Cookie', cookie).expect(400);
    for (const query of ['limit=101', 'page=0', 'sort=unknown'])
      await request().get(`${base}?${query}`).set('Cookie', cookie).expect(400);
    expect(tx.group_directions.create).not.toHaveBeenCalled();
  });
});
