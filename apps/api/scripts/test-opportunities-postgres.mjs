// Run after building the workspace. Requires a local PostgreSQL server, never
// DATABASE_URL: this script creates and drops its own uniquely named database.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@researchos/database';
import request from 'supertest';

const requireDatabase = createRequire(
  import.meta.resolve('@researchos/database'),
);
const { Client } = requireDatabase('pg');
const input = process.env.RES121_TEST_POSTGRES_URL;
if (!input)
  throw new Error(
    'Set RES121_TEST_POSTGRES_URL to a local PostgreSQL maintenance database (postgres).',
  );
const adminUrl = new URL(input);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname) ||
  adminUrl.pathname !== '/postgres'
) {
  throw new Error(
    'Only a loopback PostgreSQL URL with database name postgres is allowed.',
  );
}
const name = `res121_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${name}`;
const admin = new Client({ connectionString: adminUrl.href });
const db = new Client({ connectionString: testUrl.href });
const sql = (name) =>
  readFile(new URL(`../../../docs/database/${name}`, import.meta.url), 'utf8');
let app;
let created = false;
let checks = 0;
async function check(label, run) {
  await run();
  checks += 1;
  console.log(`PASS ${label}`);
}

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await db.connect();
  console.log(
    `Testing ${(await db.query('SELECT version()')).rows[0].version} in ${name}`,
  );
  await db.query(await sql('ResearchOS.sql'));
  const tablesBefore = (
    await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const migration = await sql('migrations/RES-121-opportunity-idempotency.sql');
  await check('migration applies twice without adding tables', async () => {
    await db.query(migration);
    await db.query(migration);
    assert.deepEqual(
      (
        await db.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows,
      tablesBefore,
    );
  });
  for (const file of [
    'schema-smoke.sql',
    'schema-auth-smoke.sql',
    'schema-policy-smoke.sql',
  ]) {
    await check(file, async () => {
      const source = (await sql(file)).replace(
        /^\\set ON_ERROR_STOP on\r?\n/m,
        '',
      );
      await db.query(source);
    });
  }

  const ids = Object.fromEntries(
    [
      'creator',
      'lead',
      'core',
      'collaborator',
      'outsider',
      'applicant',
      'guest',
      'admin',
      'inactive',
    ].map((role) => [role, randomUUID()]),
  );
  const tokens = {};
  for (const [role, id] of Object.entries(ids)) {
    await db.query(
      'INSERT INTO users(id,user_type,email,full_name,department_unit) VALUES($1,$2,$3,$4,$5)',
      [
        id,
        ['guest', 'admin'].includes(role) ? 'STAFF' : 'FACULTY',
        `${role}@res121.test.invalid`,
        role,
        'Integration',
      ],
    );
    if (role === 'inactive') {
      await db.query('UPDATE users SET is_active=false WHERE id=$1', [id]);
      continue;
    }
    await db.query(
      'INSERT INTO local_credentials(user_id,password_hash,must_change_password) VALUES($1,$2,false)',
      [id, 'TEST_ONLY_NOT_A_LOGIN_HASH'],
    );
    tokens[role] = randomUUID();
    await db.query(
      `INSERT INTO user_sessions(user_id,auth_method,session_token_hash,authenticated_at,expires_at,idle_expires_at)
      VALUES($1,'LOCAL',$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP+interval '1 hour')`,
      [id, createHash('sha256').update(tokens[role]).digest('hex')],
    );
  }
  await db.query(
    "INSERT INTO user_role_assignments(user_id,role,grant_source) VALUES($1,'ADMIN','SYSTEM')",
    [ids.admin],
  );
  const groupId = randomUUID();
  await db.query(
    "INSERT INTO research_groups(id,code,name,lead_id) VALUES($1,'res121-group','Integration group',$2)",
    [groupId, ids.lead],
  );
  await db.query(
    "INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'CORE_MEMBER'),($1,$3,'COLLABORATOR')",
    [groupId, ids.core, ids.collaborator],
  );

  process.env.DATABASE_URL = testUrl.href;
  const { AppModule } = await import('../dist/app.module.js');
  const { HttpExceptionFilter } =
    await import('../dist/common/filters/http-exception.filter.js');
  const { ApiResponseInterceptor } =
    await import('../dist/common/interceptors/api-response.interceptor.js');
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  await app.init();
  const prisma = app.get(PrismaService);
  const http = request(app.getHttpServer());
  const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
  const body = {
    title: 'Draft opportunity',
    opportunityKind: 'RESEARCH_COLLABORATION',
  };
  let personal;
  await check('HTTP create persists DRAFT and database defaults', async () => {
    const result = await http
      .post('/opportunities')
      .set(as('creator'))
      .send(body)
      .expect(201);
    personal = result.body.data;
    assert.equal(personal.status, 'DRAFT');
    assert.equal(personal.publishedAt, null);
    assert.equal(personal.responseSlaDays, 5);
    assert.equal(personal.creatorId, ids.creator);
    assert.equal(
      (
        await prisma.researchOpportunity.findUniqueOrThrow({
          where: { id: personal.id },
        })
      ).status,
      'DRAFT',
    );
  });
  await check(
    'HTTP rejects every non-DRAFT create and database independently rejects direct publish',
    async () => {
      for (const status of ['OPEN', 'FILLED', 'CLOSED', 'EXPIRED']) {
        await http
          .post('/opportunities')
          .set(as('creator'))
          .send({
            ...body,
            status,
            description: 'Complete',
            applicationDeadline: '2099-01-01T00:00:00Z',
          })
          .expect(400);
      }
      await assert.rejects(
        db.query(
          `INSERT INTO research_opportunities(creator_id,title,opportunity_kind,status,description,application_deadline,published_at)
      VALUES($1,'Direct publish','FUNDING_CALL','OPEN','Complete',clock_timestamp()+interval '1 day',clock_timestamp())`,
          [ids.creator],
        ),
        { code: '23514' },
      );
    },
  );
  await check(
    'HTTP PATCH rejects all statuses and publication timestamps',
    async () => {
      for (const status of [
        'DRAFT',
        'OPEN',
        'FILLED',
        'CLOSED',
        'EXPIRED',
        null,
      ]) {
        await http
          .patch(`/opportunities/${personal.id}`)
          .set(as('creator'))
          .send({ status })
          .expect(400);
      }
      await http
        .patch(`/opportunities/${personal.id}`)
        .set(as('creator'))
        .send({ publishedAt: new Date().toISOString() })
        .expect(400);
      await http
        .post('/opportunities')
        .set(as('creator'))
        .send({ ...body, publishedAt: new Date().toISOString() })
        .expect(400);
    },
  );
  await check(
    'migration policy agrees with API for creator, lead, core and denied actors',
    async () => {
      const scoped = randomUUID();
      // The creator is deliberately neither group lead nor member: verify the
      // existing-record policy independently from create-in-group permissions.
      await db.query(
        "INSERT INTO research_opportunities(id,group_id,creator_id,title,opportunity_kind) VALUES($1,$2,$3,'Scoped','FUNDING_CALL')",
        [scoped, groupId, ids.creator],
      );
      for (const role of [
        'creator',
        'lead',
        'core',
        'collaborator',
        'outsider',
        'guest',
        'admin',
        'inactive',
      ]) {
        const allowed = ['creator', 'lead', 'core'].includes(role);
        assert.equal(
          (
            await db.query('SELECT can_manage_opportunity($1,$2) AS allowed', [
              ids[role],
              scoped,
            ])
          ).rows[0].allowed,
          allowed,
          role,
        );
        if (role !== 'inactive')
          await http
            .patch(`/opportunities/${scoped}`)
            .set(as(role))
            .send({ title: `Edit by ${role}` })
            .expect(allowed ? 200 : 403);
      }
      await db.query('UPDATE research_groups SET is_active=false WHERE id=$1', [
        groupId,
      ]);
      await http
        .patch(`/opportunities/${scoped}`)
        .set(as('core'))
        .send({ title: 'Inactive group' })
        .expect(403);
      await http
        .patch(`/opportunities/${scoped}`)
        .set(as('creator'))
        .send({ title: 'Still creator' })
        .expect(200);
      await db.query('UPDATE research_groups SET is_active=true WHERE id=$1', [
        groupId,
      ]);
      // The application trigger must accept each actor that the API permits.
      await db.query(
        "UPDATE research_opportunities SET title='Open',description='Complete',application_deadline=clock_timestamp()+interval '1 day',status='OPEN' WHERE id=$1",
        [scoped],
      );
      for (const role of ['creator', 'lead', 'core', 'collaborator']) {
        const application = randomUUID();
        await db.query(
          "INSERT INTO opportunity_applications(id,opportunity_id,applicant_id,applicant_note) VALUES($1,$2,$3,'Interested')",
          [application, scoped, ids.applicant],
        );
        const response = () =>
          db.query(
            "UPDATE opportunity_applications SET status='DECLINED',responded_by=$1 WHERE id=$2",
            [ids[role], application],
          );
        if (role === 'collaborator') {
          await assert.rejects(response(), { code: '23514' });
          await db.query(
            "UPDATE opportunity_applications SET status='WITHDRAWN' WHERE id=$1",
            [application],
          );
        } else {
          await response();
          assert.equal(
            (
              await db.query(
                'SELECT responded_at IS NOT NULL AS stamped FROM opportunity_applications WHERE id=$1',
                [application],
              )
            ).rows[0].stamped,
            true,
          );
          // A different applicant keeps each answered row and its history.
          const nextApplicant = randomUUID();
          await db.query(
            "INSERT INTO users(id,user_type,email,full_name,department_unit) VALUES($1,'FACULTY',$2,'Next applicant','Integration')",
            [nextApplicant, `${nextApplicant}@res121.test.invalid`],
          );
          ids.applicant = nextApplicant;
        }
      }
    },
  );
  await check(
    'group create checks lead/core authority and scopes',
    async () => {
      await http
        .post('/opportunities')
        .set(as('core'))
        .send({ ...body, groupId })
        .expect(201);
      await http
        .post('/opportunities')
        .set(as('collaborator'))
        .send({ ...body, groupId })
        .expect(403);
    },
  );
  await check(
    'sessions enforce expiry, password readiness and revocation',
    async () => {
      await http.get('/opportunities').expect(401);
      await db.query(
        'UPDATE local_credentials SET must_change_password=true WHERE user_id=$1',
        [ids.guest],
      );
      await http.get('/opportunities').set(as('guest')).expect(401);
      await db.query(
        "UPDATE user_sessions SET expires_at=created_at+interval '1 microsecond',idle_expires_at=created_at+interval '1 microsecond' WHERE user_id=$1",
        [ids.outsider],
      );
      await http.get('/opportunities').set(as('outsider')).expect(401);
      await db.query(
        "UPDATE user_sessions SET revoked_at=clock_timestamp(),revocation_reason='TEST' WHERE user_id=$1",
        [ids.collaborator],
      );
      await http.get('/opportunities').set(as('collaborator')).expect(401);
    },
  );
  await check(
    'concurrent retries create exactly one row and snapshot survives editing',
    async () => {
      const key = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          http
            .post('/opportunities')
            .set(as('creator'))
            .set('Idempotency-Key', key)
            .send(body)
            .expect(201),
        ),
      );
      for (const result of responses)
        assert.deepEqual(result.body.data, responses[0].body.data);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM research_opportunities WHERE creator_id=$1 AND create_idempotency_key=$2',
            [ids.creator, key],
          )
        ).rows[0].n,
        1,
      );
      const saved = responses[0].body.data;
      await http
        .patch(`/opportunities/${saved.id}`)
        .set(as('creator'))
        .send({ title: 'Edited after creation' })
        .expect(200);
      const replay = await http
        .post('/opportunities')
        .set(as('creator'))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      assert.deepEqual(replay.body.data, saved);
      await http
        .post('/opportunities')
        .set(as('creator'))
        .set('Idempotency-Key', key)
        .send({ ...body, title: 'Different' })
        .expect(409);
      const anotherActor = await http
        .post('/opportunities')
        .set(as('lead'))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      assert.notEqual(anotherActor.body.data.id, saved.id);
      for (const field of [
        'createIdempotencyKey',
        'createRequestHash',
        'createResponse',
      ])
        assert.equal(field in saved, false);
    },
  );
  await check(
    'draft visibility, pagination and published-record validation',
    async () => {
      await http
        .get(`/opportunities/${personal.id}`)
        .set(as('lead'))
        .expect(404);
      const list = await http
        .get('/opportunities?page=1&pageSize=2')
        .set(as('creator'))
        .expect(200);
      assert.ok(list.body.data.items.length <= 2);
      await db.query(
        "UPDATE research_opportunities SET description='Details',application_deadline=clock_timestamp()+interval '1 day',status='OPEN' WHERE id=$1",
        [personal.id],
      );
      await http
        .get(`/opportunities/${personal.id}`)
        .set(as('lead'))
        .expect(200);
      await http
        .patch(`/opportunities/${personal.id}`)
        .set(as('creator'))
        .send({ description: null })
        .expect(400);
    },
  );
  console.log(`${checks} live PostgreSQL checks passed.`);
} finally {
  if (app) await app.close();
  await db.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
