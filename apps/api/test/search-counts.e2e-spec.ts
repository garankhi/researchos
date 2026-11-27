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
 * The fixtures cover all four tabs and three output audiences.
 *
 * The spec runs against its own database, built from the schema source and
 * dropped again afterwards, so it never touches the development data and
 * never leaves fixtures behind.
 */
describe('Search API', () => {
  const ownerId = randomUUID();
  const memberId = randomUUID();
  const outsiderId = randomUUID();
  const groupId = randomUUID();
  const term = 'quantum materials';
  const encodedTerm = encodeURIComponent(term);
  const countsUrl = `/search/counts?q=${encodedTerm}`;
  const resultsUrl = `/search?tab=research&q=${encodedTerm}`;
  const publicTitle = 'Quantum Materials at Scale';
  const groupTitle = 'Group Quantum Materials Report';
  const privateTitle = 'Private Quantum Materials Notes';

  const originalDatabaseUrl = process.env.DATABASE_URL;
  let app: INestApplication;
  let admin: InstanceType<typeof Client>;
  let database: InstanceType<typeof Client>;
  let databaseName = '';
  let databaseCreated = false;
  let ownerCookie: string;
  let memberCookie: string;
  let outsiderCookie: string;
  const http = createHttpTestClient();

  beforeAll(async () => {
    await ConfigModule.forRoot({
      envFilePath: resolveEnvFilePaths(resolve(import.meta.dirname, '..')),
    });

    const configuredUrl = process.env.DATABASE_URL;
    if (!configuredUrl) {
      throw new Error('DATABASE_URL is required for the search API tests');
    }

    const source = new URL(configuredUrl);
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
    ownerCookie = await createSession(ownerId);
    memberCookie = await createSession(memberId);
    outsiderCookie = await createSession(outsiderId);

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

  async function seed() {
    await database.query(
      `INSERT INTO users(id, user_type, email, full_name, department_unit)
       VALUES ($1, 'FACULTY', 'owner@example.invalid', 'Counts Owner', 'Testing'),
              ($2, 'FACULTY', 'member@example.invalid', 'Counts Member', 'Testing'),
              ($3, 'FACULTY', 'outsider@example.invalid', 'Counts Outsider', 'Testing')`,
      [ownerId, memberId, outsiderId],
    );

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
      [groupId, `COUNTS-${ownerId.slice(0, 8)}`, ownerId],
    );
    await database.query(
      'INSERT INTO group_members(group_id, user_id) VALUES ($1, $2)',
      [groupId, memberId],
    );

    // The opportunity slice. It is created as a draft and published
    // afterwards, because the trigger only allows that transition.
    await database.query(
      `INSERT INTO research_opportunities(
         id, group_id, opportunity_kind, target_audience, creator_id, title, description
       ) VALUES ($1, $3, 'RESEARCH_COLLABORATION', 'ANY_RESEARCHER', $2,
                 'Quantum Fellowship', 'A fellowship on quantum materials.')`,
      [randomUUID(), ownerId, groupId],
    );
    await database.query(
      `UPDATE research_opportunities
       SET status = 'OPEN',
           application_deadline = now() + interval '30 days',
           published_at = now()
       WHERE title = 'Quantum Fellowship'`,
    );

    for (const [scopeType, audience, title, accessGroupId] of [
      ['PERSONAL', 'FPTU_COMMUNITY', publicTitle, null],
      ['GROUP', 'CONTAINER', groupTitle, groupId],
      ['PERSONAL', 'PRIVATE', privateTitle, null],
    ] as const) {
      const output = randomUUID();
      const revision = randomUUID();

      await database.query(
        `INSERT INTO research_outputs(
           id, sharing_status, scope_type, scope_group_id, audience, owner_id, created_by, access_group_id
         ) VALUES ($1, 'DRAFT', $2, $4, $3, $5, $5, $6)`,
        [
          output,
          scopeType,
          audience,
          accessGroupId ? groupId : null,
          ownerId,
          accessGroupId,
        ],
      );
      await database.query(
        `INSERT INTO output_revisions(
           id, output_id, revision_no, title, abstract, created_by, released_by, released_at
         ) VALUES ($1, $2, 1, $3, $4, $5, $5, now())`,
        [revision, output, title, 'A study of quantum materials', ownerId],
      );
      await database.query(
        `UPDATE research_outputs
         SET current_release_id = $1, sharing_status = 'SHARED', first_shared_at = now()
         WHERE id = $2`,
        [revision, output],
      );
    }
  }

  async function createSession(userId: string): Promise<string> {
    const token = randomUUID();
    await database.query(
      `INSERT INTO local_credentials(user_id, password_hash, must_change_password)
       VALUES ($1, 'unused-fixture-hash', false)`,
      [userId],
    );
    await database.query(
      `INSERT INTO user_sessions(
         user_id, auth_method, session_token_hash, authenticated_at,
         last_seen_at, expires_at, idle_expires_at
       ) VALUES ($1, 'LOCAL', $2, now(), now(), now() + interval '1 hour', now() + interval '1 hour')`,
      [userId, createHash('sha256').update(token).digest('hex')],
    );
    return `researchos_session=${token}`;
  }

  it.each([
    {
      actor: 'owner',
      getCookie: () => ownerCookie,
      titles: [groupTitle, privateTitle, publicTitle],
    },
    {
      actor: 'group member',
      getCookie: () => memberCookie,
      titles: [groupTitle, publicTitle],
    },
    {
      actor: 'outsider',
      getCookie: () => outsiderCookie,
      titles: [publicTitle],
    },
  ])(
    'returns matching counts and results for the $actor',
    async ({ getCookie, titles }) => {
      const client = http.request(app.getHttpServer());
      const cookie = getCookie();
      const counts = await client
        .get(countsUrl)
        .set('Cookie', cookie)
        .expect(200);
      expect(counts.body).toMatchObject({
        success: true,
        data: { research: titles.length, people: 1, group: 1, opportunity: 1 },
      });

      const results = await client
        .get(`${resultsUrl}&sort=title`)
        .set('Cookie', cookie)
        .expect(200);
      expect(results.body.data).toMatchObject({
        items: titles.map((title) => ({ title })),
        meta: { total: titles.length },
      });
    },
  );

  it.each([countsUrl, resultsUrl])('requires a session for %s', async (url) => {
    const response = await http
      .request(app.getHttpServer())
      .get(url)
      .expect(401);
    expect(response.body).toMatchObject({
      success: false,
      message: 'unauthorized',
    });
  });

  it.each(['/search/counts?', '/search?tab=research&'])(
    'validates search terms for %s',
    async (prefix) => {
      const client = http.request(app.getHttpServer());
      for (const q of [' a ', 'x'.repeat(201), 'a\0b', '😀', '❤️']) {
        await client
          .get(`${prefix}q=${encodeURIComponent(q)}`)
          .set('Cookie', ownerCookie)
          .expect(400);
      }
      for (const q of ['😀'.repeat(200), '❤️'.repeat(101)]) {
        await client
          .get(`${prefix}q=${encodeURIComponent(q)}`)
          .set('Cookie', ownerCookie)
          .expect(200);
      }
    },
  );

  it('returns a sorted page and keeps the total when the page is out of range', async () => {
    const client = http.request(app.getHttpServer());
    const page = await client
      .get(`${resultsUrl}&sort=title&limit=1&page=2`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(page.body.data).toMatchObject({
      items: [{ title: privateTitle }],
      meta: {
        page: 2,
        limit: 1,
        total: 3,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });

    const pastEnd = await client
      .get(`${resultsUrl}&limit=1&page=4`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(pastEnd.body.data).toMatchObject({
      items: [],
      meta: {
        page: 4,
        total: 3,
        totalPages: 3,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  afterAll(async () => {
    http.close();
    await app?.close();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

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
