import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { GroupMemberRole, PrismaService } from '@researchos/database';
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
    tx.$queryRaw.mockResolvedValue([{ allowed: true }]);
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

  it('allows delegated group leaders to publish, edit and archive directions', async () => {
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
      .expect(200);
    await request()
      .delete(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .expect(204);
  });

  it('forbids publishing by plain members, outsiders and unrelated admins', async () => {
    tx.$queryRaw.mockResolvedValue([{ allowed: false }]);
    tx.research_groups.findUnique.mockResolvedValue({
      ...group,
      lead_id: otherId,
    });
    for (const member of [
      null,
      { role: GroupMemberRole.MEMBER },
      { role: GroupMemberRole.GROUP_LEADER, archived_at: new Date() },
    ]) {
      tx.group_members.findUnique.mockResolvedValue(member);
      await request()
        .post(base)
        .set('Cookie', cookie)
        .send({ title: 'Attempt' })
        .expect(403);
      await request()
        .patch(`${base}/${directionId}`)
        .set('Cookie', cookie)
        .send({ title: 'Attempt' })
        .expect(403);
      await request()
        .delete(`${base}/${directionId}`)
        .set('Cookie', cookie)
        .expect(403);
    }
    expect(tx.group_directions.create).not.toHaveBeenCalled();
    expect(tx.group_directions.update).not.toHaveBeenCalled();
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
        where: { group_id: groupId, archived_at: null },
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

  it.each(['true', 'all'] as const)(
    'filters and counts directions with archived=%s',
    async (archived) => {
      const archivedAt = new Date('2026-11-19T00:00:00Z');
      tx.group_directions.findMany.mockResolvedValue([
        { ...row, archived_at: archivedAt },
      ]);
      tx.group_directions.count.mockResolvedValue(4);
      const result = await request()
        .get(`${base}?archived=${archived}&limit=1`)
        .set('Cookie', cookie)
        .expect(200);
      const where =
        archived === 'true'
          ? { group_id: groupId, archived_at: { not: null } }
          : { group_id: groupId };
      expect(tx.group_directions.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, take: 1 }),
      );
      expect(tx.group_directions.count).toHaveBeenCalledWith({ where });
      expect(result.body.meta.total).toBe(4);
      expect(result.body.items[0].archivedAt).toBe(archivedAt.toISOString());
    },
  );

  it('rejects invalid archive filters and denies archive access to non-managers', async () => {
    await request()
      .get(`${base}?archived=invalid`)
      .set('Cookie', cookie)
      .expect(400);
    tx.$queryRaw.mockResolvedValue([{ allowed: false }]);
    await request()
      .get(`${base}?archived=true`)
      .set('Cookie', cookie)
      .expect(403);
    await request()
      .get(`${base}?archived=all`)
      .set('Cookie', cookie)
      .expect(403);
    await request()
      .patch(`${base}/${directionId}/restore`)
      .set('Cookie', cookie)
      .expect(403);
    expect(tx.group_directions.update).not.toHaveBeenCalled();
  });

  it('restores a direction in its own group and refuses restoration into an inactive group', async () => {
    const restore = () =>
      request().patch(`${base}/${directionId}/restore`).set('Cookie', cookie);
    await restore().expect(200);
    expect(tx.group_directions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_group_id: { id: directionId, group_id: groupId } },
        data: { archived_at: null },
      }),
    );
    tx.research_groups.findUnique.mockResolvedValue({
      ...group,
      is_active: false,
    });
    await restore().expect(409);
    tx.research_groups.findUnique.mockResolvedValue({
      ...group,
      archived_at: new Date(),
    });
    await restore().expect(409);
    expect(tx.group_directions.update).toHaveBeenCalledTimes(1);
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
        where: {
          id_group_id: { id: directionId, group_id: groupId },
          archived_at: null,
        },
        data: { topic_id: null, description: null, title: undefined },
      }),
    );
    await request()
      .delete(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(tx.group_directions.update).toHaveBeenCalledWith({
      data: { archived_at: expect.any(Date) },
      where: {
        id_group_id: { id: directionId, group_id: groupId },
        archived_at: null,
      },
    });
  });

  it('archives directions without removing project references', async () => {
    await request()
      .delete(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(tx.group_directions.delete).not.toHaveBeenCalled();
  });

  it('refuses edits to archived directions', async () => {
    tx.group_directions.findUnique.mockResolvedValue({
      ...row,
      archived_at: new Date(),
    });
    await request()
      .patch(`${base}/${directionId}`)
      .set('Cookie', cookie)
      .send({ title: 'Hidden' })
      .expect(404);
    expect(tx.group_directions.update).not.toHaveBeenCalled();
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
