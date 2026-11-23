// Run after building the workspace. Requires a local PostgreSQL server, never
// DATABASE_URL: this script creates and drops its own uniquely named database.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as wait } from 'node:timers/promises';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule, PrismaService } from '@researchos/database';
import cookieParser from 'cookie-parser';
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
  await check('applies the complete Prisma migration chain', async () => {
    const migrations = new URL(
      '../../../packages/database/prisma/migrations/',
      import.meta.url,
    );
    const entries = await readdir(migrations, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migration of names) {
      const file = new URL(`${migration}/migration.sql`, migrations);
      await db.query(await readFile(file, 'utf8'));
    }
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
      'expiredSession',
      'revokedSession',
      'freshApplicant',
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
    "INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'GROUP_LEADER'),($1,$3,'MEMBER')",
    [groupId, ids.core, ids.collaborator],
  );

  process.env.DATABASE_URL = testUrl.href;
  const { IdentityModule } =
    await import('../dist/modules/identity/identity.module.js');
  const { OpportunitiesModule } =
    await import('../dist/modules/opportunities/opportunities.module.js');
  const { HttpExceptionFilter } =
    await import('../dist/common/filters/http-exception.filter.js');
  const { ApiResponseInterceptor } =
    await import('../dist/common/interceptors/api-response.interceptor.js');
  // Use the real feature and identity modules without unrelated Redis/S3 jobs.
  const fixture = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 1000 }]),
      PrismaModule,
      IdentityModule,
      OpportunitiesModule,
    ],
  }).compile();
  app = fixture.createNestApplication({ logger: false });
  app.use(cookieParser());
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
  const as = (role) => ({ Cookie: `researchos_session=${tokens[role]}` });
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
        await prisma.research_opportunities.findUniqueOrThrow({
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
    'group opportunity management follows current group leadership',
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
        const allowed = ['lead', 'core'].includes(role);
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
        .send({ title: 'Inactive group creator' })
        .expect(403);
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
        const applicant = randomUUID();
        await db.query(
          "INSERT INTO users(id,user_type,email,full_name,department_unit) VALUES($1,'FACULTY',$2,'Test applicant','Integration')",
          [applicant, `${applicant}@res121.test.invalid`],
        );
        await db.query(
          "INSERT INTO opportunity_applications(id,opportunity_id,applicant_id,applicant_note) VALUES($1,$2,$3,'Interested')",
          [application, scoped, applicant],
        );
        const response = () =>
          db.query(
            "UPDATE opportunity_applications SET status='DECLINED',responded_by=$1 WHERE id=$2",
            [ids[role], application],
          );
        if (role === 'collaborator' || role === 'creator') {
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
      await http.get('/opportunities').set(as('guest')).expect(403);
      await db.query(
        "UPDATE user_sessions SET expires_at=created_at+interval '1 microsecond',idle_expires_at=created_at+interval '1 microsecond' WHERE user_id=$1",
        [ids.expiredSession],
      );
      await http.get('/opportunities').set(as('expiredSession')).expect(401);
      await db.query(
        "UPDATE user_sessions SET revoked_at=clock_timestamp(),revocation_reason='TEST' WHERE user_id=$1",
        [ids.revokedSession],
      );
      await http.get('/opportunities').set(as('revokedSession')).expect(401);
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
        .expect(403);
      const list = await http
        .get('/opportunities?page=1&limit=2')
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
  async function publication(singleApplicant) {
    const {
      rows: [opportunity],
    } = await db.query(
      "INSERT INTO research_opportunities (group_id,creator_id,title,description,opportunity_kind,application_deadline,auto_fill_on_acceptance) VALUES ($1,$2,'Acceptance integration','Details','RESEARCH_COLLABORATION',clock_timestamp()+interval '1 day',$3) RETURNING id",
      [groupId, ids.lead, singleApplicant],
    );
    await db.query(
      "UPDATE research_opportunities SET status='OPEN' WHERE id=$1",
      [opportunity.id],
    );
    return opportunity.id;
  }

  async function applyTo(opportunityId, actor) {
    const response = await http
      .post(`/opportunities/${opportunityId}/applications`)
      .set(as(actor))
      .send({ applicantNote: 'Interested' })
      .expect(201);
    return response.body.data.id;
  }

  function accept(applicationId, role = 'lead') {
    return http
      .post(`/applications/${applicationId}/respond`)
      .set(as(role))
      .send({ decision: 'ACCEPTED', responseNote: 'Welcome' });
  }

  await check(
    'opportunity detail returns only the signed-in applicant status',
    async () => {
      const opportunityId = await publication(false);
      await applyTo(opportunityId, 'freshApplicant');
      const path = `/opportunities/${opportunityId}`;
      const mine = await http.get(path).set(as('freshApplicant')).expect(200);
      assert.equal(mine.body.data.myApplicationStatus, 'PENDING');
      const other = await http.get(path).set(as('lead')).expect(200);
      assert.equal(other.body.data.myApplicationStatus, null);
    },
  );

  for (const change of ['revoke role', 'archive group']) {
    await check(
      `acceptance rechecks authorization after concurrent ${change}`,
      async () => {
        const opportunityId = await publication(false);
        const applicationId = await applyTo(opportunityId, 'freshApplicant');
        const editor = new Client({ connectionString: testUrl.href });
        await editor.connect();
        let acceptance;
        try {
          const {
            rows: [{ pid }],
          } = await editor.query('SELECT pg_backend_pid() AS pid');
          await editor.query('BEGIN');
          await editor.query(
            'SELECT id FROM research_groups WHERE id=$1 FOR UPDATE',
            [groupId],
          );
          if (change === 'archive group') {
            await editor.query(
              'UPDATE research_groups SET is_active=false WHERE id=$1',
              [groupId],
            );
          } else {
            await editor.query(
              "UPDATE group_members SET role='MEMBER' WHERE group_id=$1 AND user_id=$2",
              [groupId, ids.core],
            );
          }
          acceptance = accept(applicationId, 'core').then(
            (response) => response,
          );
          const timeout = Date.now() + 3_000;
          let blocked = false;
          while (!blocked && Date.now() < timeout) {
            const {
              rows: [state],
            } = await db.query(
              'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1::int = ANY(pg_blocking_pids(pid))) AS blocked',
              [pid],
            );
            blocked = state.blocked;
            if (!blocked) await wait(25);
          }
          assert.equal(
            blocked,
            true,
            'acceptance should wait for the group lock',
          );
          await editor.query('COMMIT');
          assert.equal((await acceptance).status, 403);
          const {
            rows: [outcome],
          } = await db.query(
            'SELECT status, EXISTS (SELECT 1 FROM group_members WHERE group_id=$2 AND user_id=applicant_id) AS added FROM opportunity_applications WHERE id=$1',
            [applicationId, groupId],
          );
          assert.deepEqual(outcome, { status: 'PENDING', added: false });
        } finally {
          await editor.end();
          await acceptance;
          await db.query(
            'UPDATE research_groups SET is_active=true WHERE id=$1',
            [groupId],
          );
          await db.query(
            "UPDATE group_members SET role='GROUP_LEADER' WHERE group_id=$1 AND user_id=$2",
            [groupId, ids.core],
          );
        }
      },
    );
  }

  await check(
    'concurrent single-applicant decisions commit one acceptance and fill audit',
    async () => {
      const opportunityId = await publication(true);
      const applications = await Promise.all([
        applyTo(opportunityId, 'applicant'),
        applyTo(opportunityId, 'outsider'),
      ]);
      const results = await Promise.all(
        applications.map((applicationId) => accept(applicationId)),
      );
      assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
      const [winner] = results.filter(({ status }) => status === 200);
      assert.equal(winner.body.data.membership.role, 'MEMBER');
      const once = await accept(winner.body.data.id).expect(200);
      assert.equal(once.body.data.respondedAt, winner.body.data.respondedAt);
      const audits = await db.query(
        "SELECT payload FROM audit_logs WHERE entity_id=$1 AND payload->>'reason'='APPLICATION_ACCEPTED'",
        [opportunityId],
      );
      assert.equal(audits.rowCount, 1);
      assert.equal(
        (
          await db.query(
            'SELECT status FROM research_opportunities WHERE id=$1',
            [opportunityId],
          )
        ).rows[0].status,
        'FILLED',
      );
      await http
        .post(`/opportunities/${opportunityId}/applications`)
        .set(as('collaborator'))
        .send({ applicantNote: 'Too late' })
        .expect(409);
    },
  );

  await check(
    'delegated response preserves an existing role and manual-fill status',
    async () => {
      const opportunityId = await publication(false);
      const applicationId = await applyTo(opportunityId, 'core');
      await accept(applicationId, 'outsider').expect(403);
      const result = await accept(applicationId, 'core').expect(200);
      assert.equal(result.body.data.membership.role, 'GROUP_LEADER');
      assert.equal(
        (
          await db.query(
            'SELECT status FROM research_opportunities WHERE id=$1',
            [opportunityId],
          )
        ).rows[0].status,
        'OPEN',
      );
    },
  );

  await check(
    'post-cutoff acceptance enrolls the applicant and leaves expiry to the worker',
    async () => {
      const opportunityId = await publication(true);
      const applicationId = await applyTo(opportunityId, 'collaborator');
      await db.query(
        'UPDATE research_opportunities SET application_deadline=clock_timestamp() WHERE id=$1',
        [opportunityId],
      );
      const result = await accept(applicationId).expect(200);
      assert.equal(result.body.data.membership.role, 'MEMBER');
      assert.equal(
        (
          await db.query(
            'SELECT status FROM research_opportunities WHERE id=$1',
            [opportunityId],
          )
        ).rows[0].status,
        'OPEN',
      );
      await db.query(
        "UPDATE research_opportunities SET status='EXPIRED' WHERE id=$1",
        [opportunityId],
      );
      await accept(applicationId).expect(200);
    },
  );

  if (process.env.RES156_TEST_REDIS_URL) {
    const { verifyScheduledExpiry } =
      await import('./verify-scheduled-expiry.mjs');
    await check(
      'standalone workers expire opportunities without API reads and recover after failure',
      () =>
        verifyScheduledExpiry({
          db,
          databaseUrl: testUrl.href,
          redisUrl: process.env.RES156_TEST_REDIS_URL,
          ownerId: ids.creator,
        }),
    );
  }

  console.log(`${checks} live PostgreSQL checks passed.`);
} finally {
  if (app) await app.close();
  await db.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
