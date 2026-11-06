import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { ConfigService } from '@nestjs/config';
import { SYSTEM_QUEUE, createQueueOptions } from '@researchos/queue';
import { Queue } from 'bullmq';
import { hash, verify } from '@node-rs/argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../dist/app.module.js';
import { HttpExceptionFilter } from '../dist/common/filters/http-exception.filter.js';
import { ApiResponseInterceptor } from '../dist/common/interceptors/api-response.interceptor.js';

describe('mandatory password change with real sessions and credential triggers', () => {
  const previousPrefix = process.env.QUEUE_PREFIX;
  const prefix = `password-e2e-${randomUUID()}`;
  const userId = randomUUID();
  const temporaryPassword = `Temporary-${randomUUID()}`;
  const newPassword = `Replacement-${randomUUID()}`;
  const email = `${userId}@password-e2e.invalid`;
  const tokens = [randomUUID(), randomUUID(), randomUUID()];
  const cookie = (index = 0) => `researchos_session=${tokens[index]}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let systemQueue: Queue | undefined;

  beforeAll(async () => {
    process.env.QUEUE_PREFIX = prefix;
    app = await NestFactory.create(AppModule, { logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorFormat: 'grouped',
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    systemQueue = new Queue(
      SYSTEM_QUEUE,
      createQueueOptions(
        app.get(ConfigService).getOrThrow<string>('REDIS_URL'),
        prefix,
      ),
    );
    await prisma.users.create({
      data: {
        id: userId,
        user_type: 'STAFF',
        email,
        full_name: 'Password fixture',
        department_unit: 'Testing',
        local_credentials: {
          create: {
            password_hash: await hash(temporaryPassword),
            must_change_password: true,
          },
        },
      },
    });
    await prisma.user_role_assignments.create({
      data: { user_id: userId, role: 'ADMIN', grant_source: 'SYSTEM' },
    });
    for (const token of tokens)
      await prisma.user_sessions.create({
        data: {
          user_id: userId,
          auth_method: 'LOCAL',
          session_token_hash: createHash('sha256').update(token).digest('hex'),
          authenticated_at: new Date(),
          expires_at: new Date(Date.now() + 3_600_000),
          idle_expires_at: new Date(Date.now() + 1_800_000),
        },
      });
  });

  it('refuses protected ADMIN and owner APIs with the password-change code', async () => {
    const before = await prisma.background_jobs.count({
      where: { owner_id: userId },
    });
    for (const action of [
      request(app.getHttpServer())
        .post('/jobs/probes')
        .send({ idempotencyKey: randomUUID() }),
      request(app.getHttpServer()).get(`/jobs/${randomUUID()}`),
      request(app.getHttpServer()).post(`/jobs/${randomUUID()}/retry`),
    ]) {
      const response = await action.set('Cookie', cookie()).expect(403);
      expect(response.body).toMatchObject({
        success: false,
        data: null,
        message: 'must_change_password',
      });
    }
    expect(
      await prisma.background_jobs.count({ where: { owner_id: userId } }),
    ).toBe(before);
    const me = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie())
      .expect(200);
    expect(me.body.data).toMatchObject({
      id: userId,
      roles: ['ADMIN'],
      mustChangePassword: true,
    });
  });

  it('requires authentication, the current password and a valid different replacement', async () => {
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({ currentPassword: temporaryPassword, newPassword })
      .expect(401);
    const rejected = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Cookie', cookie())
      .send({ currentPassword: 'wrong-password', newPassword })
      .expect(401);
    expect(rejected.body.message).toBe('invalid_credentials');
    const short = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Cookie', cookie())
      .send({ currentPassword: temporaryPassword, newPassword: 'short' })
      .expect(400);
    expect(short.body.errors).toContainEqual({
      field: 'newPassword',
      messages: ['new_password_too_short'],
    });
    const unchanged = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Cookie', cookie())
      .send({
        currentPassword: temporaryPassword,
        newPassword: temporaryPassword,
      })
      .expect(400);
    expect(unchanged.body.message).toBe('password_unchanged');
    const credential = await prisma.local_credentials.findUniqueOrThrow({
      where: { user_id: userId },
    });
    expect(credential.must_change_password).toBe(true);
    expect(await verify(credential.password_hash, temporaryPassword)).toBe(
      true,
    );
  });

  it('still allows a restricted session to log out', async () => {
    const result = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie(1))
      .expect(200);
    expect(result.body.data.revoked).toBe(true);
    await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie(1))
      .expect(401);
    await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie())
      .expect(200);
  });

  it('changes the hash, clears the gate and revokes all sessions including the caller', async () => {
    const before = await prisma.local_credentials.findUniqueOrThrow({
      where: { user_id: userId },
    });
    const result = await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Cookie', cookie())
      .send({ currentPassword: temporaryPassword, newPassword })
      .expect(200);
    expect(result.body).toMatchObject({
      success: true,
      data: { changed: true },
      message: '',
    });
    expect(result.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^researchos_session=;/)]),
    );
    const after = await prisma.local_credentials.findUniqueOrThrow({
      where: { user_id: userId },
    });
    expect(after.must_change_password).toBe(false);
    expect(after.password_changed_at.getTime()).toBeGreaterThan(
      before.password_changed_at.getTime(),
    );
    expect(await verify(after.password_hash, newPassword)).toBe(true);
    expect(await verify(after.password_hash, temporaryPassword)).toBe(false);
    const sessions = await prisma.user_sessions.findMany({
      where: { user_id: userId },
    });
    expect(sessions.every((session) => session.revoked_at !== null)).toBe(true);
    expect(
      sessions.filter(
        (session) => session.revocation_reason === 'PASSWORD_CHANGED',
      ),
    ).toHaveLength(2);
    await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie())
      .expect(401);
    await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', cookie(2))
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: temporaryPassword })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
    expect(login.body.data.mustChangePassword).toBe(false);
    const renewedCookie = String(login.headers['set-cookie'][0]).split(';')[0]!;
    // ADMIN grant remains unchanged; a normal job read now reaches ownership
    // lookup (404), rather than the password gate (403).
    await request(app.getHttpServer())
      .get(`/jobs/${randomUUID()}`)
      .set('Cookie', renewedCookie)
      .expect(404);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.background_jobs.deleteMany({
          where: { owner_id: userId },
        });
        await prisma.user_sessions.deleteMany({ where: { user_id: userId } });
        await prisma.user_role_assignments.deleteMany({
          where: { user_id: userId },
        });
        await prisma.users.deleteMany({ where: { id: userId } });
      }
    } finally {
      await app?.close();
      try {
        await systemQueue?.obliterate({ force: true });
      } finally {
        await systemQueue?.close();
      }
      if (previousPrefix === undefined) delete process.env.QUEUE_PREFIX;
      else process.env.QUEUE_PREFIX = previousPrefix;
    }
  });
});
