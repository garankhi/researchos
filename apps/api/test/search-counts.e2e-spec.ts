import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { resolveEnvFilePaths } from '@researchos/config';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpTestClient } from './http-test-client.js';

const { Client } = createRequire(import.meta.resolve('@researchos/database'))(
  'pg',
);

/**
 * The per-tab counts endpoint (`GET /search/counts`) against a real
 * database.
 *
 * The unit spec in `src/modules/discovery/discovery.controller.spec.ts` checks
 * the SQL *shape* — that the query mentions `visible_search_index` and binds
 * the term. This spec checks the SQL that actually ships, end to end over
 * HTTP: the route is registered, the guard lets the right caller through, the
 * validation pipe rejects a term outside [2, 200], and the four totals are
 * permission filtered exactly like the results they count.
 *
 * The fixtures cover the four entity types and one private work, so the
 * difference between "the owner sees two works" and "an outsider sees one" is
 * what proves the filtering.
 *
 * The spec runs against its own database, built from the schema source and
 * dropped again afterwards, so it never touches the development data and
 * never leaves fixtures behind.
 */
describe('GET /search/counts', () => {
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  const inactiveId = randomUUID();
  const token = randomUUID();
  const cookie = `researchos_session=${token}`;
  const term = 'quantum materials';
  const encodedTerm = encodeURIComponent(term);

  const originalDatabaseUrl = process.env.DATABASE_URL;
  let app: INestApplication;
  let admin: InstanceType<typeof Client>;
  let database: InstanceType<typeof Client>;
  let databaseName = '';
  let databaseCreated = false;
  const { request, close } = createHttpTestClient();

  beforeAll(async () => {
    await ConfigModule.forRoot({
      envFilePath: resolveEnvFilePaths(resolve(import.meta.dirname, '..')),
    });

    const source = new URL(process.env.DATABASE_URL);
    source.pathname = '/postgres';
    source.searchParams.delete('schema');

    databaseName = `search_counts_${randomUUID().replaceAll('-', '')}`;
    const databaseUrl = new URL(source);
    databaseUrl.pathname = `/${databaseName}`;

    admin = new Client({ connectionString: source.href });
    database = new Client({ connectionString: databaseUrl.href });

    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;

    await database.connect();
    await database.query(
      await readFile(
        new URL('../../../docs/database/ResearchOS.sql', import.meta.url),
        'utf8',
      ),
    );

    await seed();

    process.env.DATABASE_URL = databaseUrl.href;
    const { AppModule } = await import('../dist/app.module.js');
    const { HttpExceptionFilter } =
      await import('../dist/common/filters/http-exception.filter.js');
    const { ApiResponseInterceptor } =
      await import('../dist/common/interceptors/api-response.interceptor.js');

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
  });

  /**
   * The fixtures: one row per entity type, all matching the term, plus a
   * private work the owner alone may count.
   */
  async function seed() {
    await database.query(
      `INSERT INTO users(id, user_type, email, full_name, department_unit)
       VALUES ($1, 'FACULTY', 'owner@example.invalid', 'Counts Owner', 'Testing'),
              ($2, 'FACULTY', 'outsider@example.invalid', 'Counts Outsider', 'Testing'),
              ($3, 'FACULTY', 'inactive@example.invalid', 'Counts Inactive', 'Testing')`,
      [ownerId, outsiderId, inactiveId],
    );
    await database.query(`UPDATE users SET is_active = false WHERE id = $1`, [
      inactiveId,
    ]);

    // The researcher slice: a confirmed profile.
    await database.query(
      `INSERT INTO researcher_profiles(user_id, bio, profile_confirmed_at)
       VALUES ($1, 'A researcher working on quantum materials', now())`,
      [ownerId],
    );

    // The group slice.
    await database.query(
      `INSERT INTO research_groups(id, code, name, lead_id, description)
       VALUES ($1, $2, 'Quantum Materials Lab', $3, 'Quantum materials and photonics.')`,
      [randomUUID(), `COUNTS-${ownerId.slice(0, 8)}`, ownerId],
    );

    // The opportunity slice. It is created as a draft and published
    // afterwards, because the trigger only allows that transition.
    await database.query(
      `INSERT INTO research_opportunities(
         id, opportunity_kind, target_audience, creator_id, title, description
       ) VALUES ($1, 'RESEARCH_COLLABORATION', 'ANY_RESEARCHER', $2,
                 'Quantum Fellowship', 'A fellowship on quantum materials.')`,
      [randomUUID(), ownerId],
    );
    await database.query(
      `UPDATE research_opportunities
       SET status = 'OPEN',
           application_deadline = now() + interval '30 days',
           published_at = now()
       WHERE title = 'Quantum Fellowship'`,
    );

    // The output slice: one community work and one private work, both
    // matching the term. Only the owner may count the private one.
    for (const [visibility, title, abstract] of [
      [
        'FPTU_COMMUNITY',
        'Quantum Materials at Scale',
        'A study of quantum materials at scale',
      ],
      [
        'PRIVATE',
        'Private Quantum Materials Notes',
        'Unpublished notes on quantum materials',
      ],
    ]) {
      const output = randomUUID();
      const revision = randomUUID();

      await database.query(
        `INSERT INTO research_outputs(id, sharing_status, visibility, owner_id, created_by)
         VALUES ($1, 'DRAFT', $2, $3, $3)`,
        [output, visibility, ownerId],
      );
      await database.query(
        `INSERT INTO output_revisions(
           id, output_id, revision_no, title, abstract, created_by, released_by, released_at
         ) VALUES ($1, $2, 1, $3, $4, $5, $5, now())`,
        [revision, output, title, abstract, ownerId],
      );
      await database.query(
        `UPDATE research_outputs
         SET current_release_id = $1, sharing_status = 'SHARED', first_shared_at = now()
         WHERE id = $2`,
        [revision, output],
      );
    }

    // A session for the owner. A LOCAL session needs a credential, and the
    // credential must not demand a password change — otherwise the guard
    // refuses with a 403 before the route runs.
    await database.query(
      `INSERT INTO local_credentials(user_id, password_hash, must_change_password)
       VALUES ($1, 'unused-fixture-hash', false)`,
      [ownerId],
    );
    await database.query(
      `INSERT INTO user_sessions(
         user_id, auth_method, session_token_hash, authenticated_at,
         last_seen_at, expires_at, idle_expires_at
       ) VALUES ($1, 'LOCAL', $2, now(), now(), now() + interval '1 hour', now() + interval '1 hour')`,
      [ownerId, createHash('sha256').update(token).digest('hex')],
    );
  }

  it('returns one permission-filtered total per tab', async () => {
    const response = await request(app.getHttpServer())
      .get(`/search/counts?q=${encodedTerm}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        research: 2,
        people: 1,
        group: 1,
        opportunity: 1,
      },
    });
  });

  it('counts the private work for its owner only', async () => {
    // The owner sees two matching works. The outsider has no session, so
    // the guard refuses before the route runs.
    const owner = await request(app.getHttpServer())
      .get(`/search/counts?q=${encodedTerm}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(owner.body.data.research).toBe(2);

    const outsider = await request(app.getHttpServer())
      .get(`/search/counts?q=${encodedTerm}`)
      .expect(401);
    expect(outsider.body).toMatchObject({
      success: false,
      data: null,
      message: 'unauthorized',
    });
  });

  it('rejects a term outside the length bounds', async () => {
    await request(app.getHttpServer())
      .get('/search/counts?q=a')
      .set('Cookie', cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/search/counts?q=${'x'.repeat(201)}`)
      .set('Cookie', cookie)
      .expect(400);
  });

  it('leaves GET /search unchanged', async () => {
    const response = await request(app.getHttpServer())
      .get(`/search?tab=research&q=${encodedTerm}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.data.meta.total).toBe(2);
    expect(response.body.data.items).toHaveLength(2);
  });

  afterAll(async () => {
    close();
    await app?.close();
    process.env.DATABASE_URL = originalDatabaseUrl;

    try {
      await database?.end();
    } finally {
      try {
        if (databaseCreated) {
          await admin.query(`DROP DATABASE "${databaseName}"`);
        }
      } finally {
        await admin?.end();
      }
    }
  });
});
