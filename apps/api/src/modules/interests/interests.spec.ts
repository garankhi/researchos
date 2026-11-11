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
import { InterestsController } from './interests.controller.js';
import { InterestsService } from './interests.service.js';

const userId = '10000000-0000-4000-8000-000000000001';
const topicId = '10000000-0000-4000-8000-000000000002';
const id = '10000000-0000-4000-8000-000000000003';
const row = {
  id,
  user_id: userId,
  topic_id: topicId,
  source_type: 'INFERRED',
  status: 'SUGGESTED',
  provenance_tag: 'AI_INF',
  evidence_note: 'Publication evidence',
  declared_at: new Date('2026-11-01T00:00:00Z'),
  reviewed_at: null,
};
const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('fixture', {
    code,
    clientVersion: 'test',
  });

describe('Research interests HTTP contract', () => {
  let app: INestApplication;
  const httpClient = createHttpTestClient();
  const request = (server: Parameters<typeof httpClient.request>[0]) =>
    httpClient.request(server);
  const prisma = {
    research_topics: { findUnique: vi.fn() },
    research_interests: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const resolver = {
    resolve: vi.fn(async (token: string) =>
      token === 'valid'
        ? { userId, sessionId: 'test', mustChangePassword: false }
        : null,
    ),
    refresh: vi.fn().mockResolvedValue(undefined),
    effectiveRoles: vi.fn(),
  };
  const cookie = 'researchos_session=valid';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InterestsController],
      providers: [
        InterestsService,
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
    vi.clearAllMocks();
    resolver.effectiveRoles.mockResolvedValue({
      isResearcher: true,
      isAdmin: false,
    });
    prisma.research_topics.findUnique.mockResolvedValue({ is_active: true });
    prisma.research_interests.findMany.mockResolvedValue([row]);
    prisma.research_interests.findFirst.mockResolvedValue(row);
    prisma.research_interests.create.mockImplementation(async ({ data }) => ({
      ...row,
      ...data,
    }));
    prisma.research_interests.update.mockImplementation(async ({ data }) => ({
      ...row,
      ...data,
    }));
  });
  afterAll(async () => {
    httpClient.close();
    await app?.close();
  });

  it('requires authentication and researcher access on every route', async () => {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const path = ['patch', 'delete'].includes(method)
        ? `/interests/${id}`
        : '/interests';
      await request(app.getHttpServer())[method](path).expect(401);
      resolver.effectiveRoles.mockResolvedValue({
        isResearcher: false,
        isAdmin: true,
      });
      await request(app.getHttpServer())
        [method](path)
        .set('Cookie', cookie)
        .expect(403);
    }
    expect(prisma.research_interests.create).not.toHaveBeenCalled();
  });

  it('lists only caller interests, including suggestions and rejections, with ISO dates', async () => {
    const response = await request(app.getHttpServer())
      .get('/interests')
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body[0]).toMatchObject({
      userId,
      sourceType: 'INFERRED',
      status: 'SUGGESTED',
      declaredAt: '2026-11-01T00:00:00.000Z',
      reviewedAt: null,
    });
    expect(prisma.research_interests.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: userId } }),
    );
  });

  it('declares a topic as HUMAN/DECLARED/ACTIVE with server-owned identity and timestamps', async () => {
    const response = await request(app.getHttpServer())
      .post('/interests')
      .set('Cookie', cookie)
      .send({ topicId })
      .expect(201);
    expect(response.body).toMatchObject({
      userId,
      topicId,
      sourceType: 'DECLARED',
      status: 'ACTIVE',
      provenanceTag: 'HUMAN',
    });
    expect(response.body.reviewedAt).toEqual(expect.any(String));
  });

  it('returns 404 for missing topics and 400 for inactive topics', async () => {
    prisma.research_topics.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/interests')
      .set('Cookie', cookie)
      .send({ topicId })
      .expect(404);
    prisma.research_topics.findUnique.mockResolvedValue({ is_active: false });
    await request(app.getHttpServer())
      .post('/interests')
      .set('Cookie', cookie)
      .send({ topicId })
      .expect(400);
    expect(prisma.research_interests.create).not.toHaveBeenCalled();
  });

  it('maps unique violations, including concurrent or rejected duplicates, to 409', async () => {
    prisma.research_interests.create.mockRejectedValue(knownError('P2002'));
    await request(app.getHttpServer())
      .post('/interests')
      .set('Cookie', cookie)
      .send({ topicId })
      .expect(409);
  });

  it('accepts inference while preserving source, evidence, and declaration date', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/interests/${id}`)
      .set('Cookie', cookie)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(response.body).toMatchObject({
      sourceType: 'INFERRED',
      evidenceNote: row.evidence_note,
      status: 'ACTIVE',
      declaredAt: row.declared_at.toISOString(),
    });
    expect(prisma.research_interests.update).toHaveBeenCalledWith({
      where: { id, user_id: userId },
      data: { status: 'ACTIVE', reviewed_at: expect.any(Date) },
    });
  });

  it('rejects without deleting, even when the topic is inactive', async () => {
    prisma.research_topics.findUnique.mockResolvedValue({ is_active: false });
    await request(app.getHttpServer())
      .delete(`/interests/${id}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(prisma.research_interests.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'REJECTED', reviewed_at: expect.any(Date) },
      }),
    );
    expect(prisma.research_topics.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the review timestamp when rejecting an already rejected interest', async () => {
    prisma.research_interests.findFirst.mockResolvedValue({
      ...row,
      status: 'REJECTED',
      reviewed_at: new Date(),
    });
    await request(app.getHttpServer())
      .delete(`/interests/${id}`)
      .set('Cookie', cookie)
      .expect(204);
    expect(prisma.research_interests.update).not.toHaveBeenCalled();
  });

  it('hides missing and foreign interests on both mutation routes', async () => {
    prisma.research_interests.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .patch(`/interests/${id}`)
      .set('Cookie', cookie)
      .send({ status: 'ACTIVE' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/interests/${id}`)
      .set('Cookie', cookie)
      .expect(404);
    expect(prisma.research_interests.findFirst).toHaveBeenCalledWith({
      where: { id, user_id: userId },
    });
    expect(prisma.research_interests.update).not.toHaveBeenCalled();
  });

  it('refuses activation of inactive topics and maps a concurrently removed row to 404', async () => {
    prisma.research_topics.findUnique.mockResolvedValue({ is_active: false });
    await request(app.getHttpServer())
      .patch(`/interests/${id}`)
      .set('Cookie', cookie)
      .send({ status: 'ACTIVE' })
      .expect(400);
    prisma.research_interests.update.mockRejectedValue(knownError('P2025'));
    await request(app.getHttpServer())
      .delete(`/interests/${id}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('validates UUIDs, decisions, required fields and rejects metadata spoofing', async () => {
    for (const body of [
      {},
      { topicId: 'bad' },
      { topicId, userId },
      { topicId, sourceType: 'INFERRED' },
    ]) {
      await request(app.getHttpServer())
        .post('/interests')
        .set('Cookie', cookie)
        .send(body)
        .expect(400);
    }
    for (const body of [
      {},
      { status: null },
      { status: 'SUGGESTED' },
      { status: 'UNKNOWN' },
      { status: 'ACTIVE', evidenceNote: 'fake' },
    ]) {
      await request(app.getHttpServer())
        .patch(`/interests/${id}`)
        .set('Cookie', cookie)
        .send(body)
        .expect(400);
    }
    await request(app.getHttpServer())
      .delete('/interests/bad')
      .set('Cookie', cookie)
      .expect(400);
    expect(prisma.research_interests.create).not.toHaveBeenCalled();
    expect(prisma.research_interests.update).not.toHaveBeenCalled();
  });
});
