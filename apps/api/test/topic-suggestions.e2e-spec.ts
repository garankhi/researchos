import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import {
  ValidationPipe,
  type INestApplication,
  type INestApplicationContext,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  DIGEST_QUEUE,
  RESEARCH_UPDATES_QUEUE,
  SYSTEM_QUEUE,
  TOPIC_SUGGESTION_QUEUE,
  createQueueOptions,
} from '@researchos/queue';
import { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../dist/app.module.js';
import { HttpExceptionFilter } from '../dist/common/filters/http-exception.filter.js';
import { ApiResponseInterceptor } from '../dist/common/interceptors/api-response.interceptor.js';
import { AppModule as WorkerModule } from '../../worker/dist/app.module.js';
import { TopicEmbeddingIndexService } from '../../worker/dist/modules/jobs/topic-embedding-index.service.js';
import { createHttpTestClient } from './http-test-client.js';

const { Client } = createRequire(import.meta.resolve('@researchos/database'))(
  'pg',
);
const migrations = new URL(
  '../../../packages/database/prisma/migrations/',
  import.meta.url,
);
const path = '/taxonomy/topic-suggestions';
const model = 'qwen3-embedding:0.6b';
const fixtureDigest = 'a'.repeat(64);
const otherDigest = 'b'.repeat(64);
const recipe = (digest: string) => `${model}:${digest}:v1:1024`;

function fixtureVector(text: string): number[] {
  const vector = Array<number>(1024).fill(0);
  if (text === 'Invalid embedding Topic') return vector;
  if (/quang học lượng tử|quantum optics/iu.test(text)) {
    vector[3] = 1;
    return vector;
  }
  const dimension = /thị giác|machine vision/iu.test(text)
    ? 0
    : /truy hồi|information retrieval/iu.test(text)
      ? 1
      : 2;
  vector[dimension] = 1;
  return vector;
}

describe('Article Topic suggestions: HTTP, outbox, worker and active taxonomy', () => {
  const originalEnv = { ...process.env };
  const databaseName = `topic_suggestions_${randomUUID().replaceAll('-', '')}`;
  const queuePrefix = `topic-e2e-${randomUUID()}`;
  const http = createHttpTestClient();
  const author = randomUUID();
  const otherUser = randomUUID();
  const subfield = randomUUID();
  const vision = randomUUID();
  const retrieval = randomUUID();
  const inactive = randomUUID();
  const tokens = new Map<string, string>();
  const embeddedTopics: string[] = [];
  const url = (id: string) => `${path}/${id}`;
  const cookie = (actor = author) => `researchos_session=${tokens.get(actor)}`;

  let admin: InstanceType<typeof Client>;
  let db: InstanceType<typeof Client>;
  let databaseCreated = false;
  let app: INestApplication | undefined;
  let worker: INestApplicationContext | undefined;
  let ollama: Server | undefined;
  let modelDigest = fixtureDigest;
  let timeoutArticle = false;
  let queueConfigured = false;
  let holdTopic:
    { text: string; reached: () => void; release: Promise<void> } | undefined;

  async function startOllamaFixture() {
    ollama = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') {
        res.end(
          JSON.stringify({ models: [{ name: model, digest: modelDigest }] }),
        );
        return;
      }
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) chunks.push(chunk as Uint8Array);
      const payload = JSON.parse(Buffer.concat(chunks).toString()) as {
        input: string[];
      };
      const isArticle = payload.input[0]?.startsWith('Instruct: ');
      if (isArticle && timeoutArticle) return;
      if (!isArticle) embeddedTopics.push(...payload.input);
      const hold = holdTopic;
      if (hold && payload.input.includes(hold.text)) {
        hold.reached();
        await hold.release;
      }
      if (payload.input.includes('Rejected input Topic')) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid fixture input' }));
        return;
      }
      res.end(JSON.stringify({ embeddings: payload.input.map(fixtureVector) }));
    });
    await new Promise<void>((resolve, reject) =>
      ollama!.once('error', reject).listen(0, '127.0.0.1', resolve),
    );
    const address = ollama.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture port');
    process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${address.port}`;
  }

  async function seedUser(id: string, userType: string) {
    await db.query(
      `INSERT INTO users (id, user_type, email, full_name, department_unit)
       VALUES ($1, $2, $3, 'Fixture author', 'Integration')`,
      [id, userType, `${id}@topics.test.invalid`],
    );
    await db.query(
      `INSERT INTO local_credentials (user_id, password_hash, must_change_password)
       VALUES ($1, 'unused-test-hash', false)`,
      [id],
    );
    const token = randomUUID();
    tokens.set(id, token);
    await db.query(
      `INSERT INTO user_sessions (user_id, auth_method, session_token_hash,
         authenticated_at, expires_at, idle_expires_at)
       VALUES ($1, 'LOCAL', $2, now(), now() + interval '1 hour', now() + interval '30 minutes')`,
      [id, createHash('sha256').update(token).digest('hex')],
    );
  }

  async function seedTopic(id: string, name: string) {
    await db.query(
      `INSERT INTO research_topics (id, subfield_id, name, created_by)
       VALUES ($1, $2, $3, $4)`,
      [id, subfield, name, author],
    );
  }

  beforeAll(async () => {
    if (!originalEnv.DATABASE_URL || !originalEnv.REDIS_URL) {
      throw new Error(
        'DATABASE_URL and REDIS_URL are required for Topic suggestion tests',
      );
    }
    const adminUrl = new URL(originalEnv.DATABASE_URL);
    adminUrl.pathname = '/postgres';
    adminUrl.searchParams.delete('schema');
    const dbUrl = new URL(adminUrl);
    dbUrl.pathname = `/${databaseName}`;
    admin = new Client({ connectionString: adminUrl.href });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    db = new Client({ connectionString: dbUrl.href });
    await db.connect();
    const directories = await readdir(migrations, { withFileTypes: true });
    for (const name of directories
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      await db.query(
        await readFile(new URL(`${name}/migration.sql`, migrations), 'utf8'),
      );
    }

    await seedUser(author, 'FACULTY');
    await seedUser(otherUser, 'STAFF');
    const field = randomUUID();
    await db.query(
      "INSERT INTO research_fields (id, name, source, external_id) VALUES ($1, 'Fixture Field', 'OPENALEX', 'https://openalex.org/fields/fixture')",
      [field],
    );
    await db.query(
      "INSERT INTO research_subfields (id, field_id, name, source, external_id) VALUES ($1, $2, 'Fixture Subfield', 'OPENALEX', 'https://openalex.org/subfields/fixture')",
      [subfield, field],
    );
    await seedTopic(vision, 'Machine vision');
    await db.query(
      `INSERT INTO research_topics (id, subfield_id, name, source, external_id)
       VALUES ($1, $2, 'Information retrieval', 'OPENALEX', 'https://openalex.org/T-fixture')`,
      [retrieval, subfield],
    );
    await seedTopic(inactive, 'Machine vision inactive');
    await db.query(
      'UPDATE research_topics SET is_active = false WHERE id = $1',
      [inactive],
    );
    for (let i = 1; i <= 5; i += 1)
      await seedTopic(randomUUID(), `Background Topic ${i}`);

    await startOllamaFixture();
    process.env.DATABASE_URL = dbUrl.href;
    process.env.QUEUE_PREFIX = queuePrefix;
    queueConfigured = true;
    process.env.OLLAMA_EMBEDDING_DIGEST = fixtureDigest;
    app = await NestFactory.create(AppModule, { logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.listen(0, '127.0.0.1');
    worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
  });

  afterAll(async () => {
    http.close();
    ollama?.closeAllConnections();
    await worker?.close();
    await app?.close();
    await new Promise<void>((resolve) => {
      if (ollama) ollama.close(() => resolve());
      else resolve();
    });
    await db?.end();
    if (databaseCreated)
      await admin?.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await admin?.end();
    if (queueConfigured) await removeFixtureQueues(originalEnv.REDIS_URL!);
    for (const name of [
      'DATABASE_URL',
      'QUEUE_PREFIX',
      'OLLAMA_BASE_URL',
      'OLLAMA_EMBEDDING_DIGEST',
    ]) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });

  async function removeFixtureQueues(redisUrl: string): Promise<void> {
    const options = createQueueOptions(redisUrl, queuePrefix);
    await Promise.all(
      [
        SYSTEM_QUEUE,
        BACKGROUND_QUEUE,
        RESEARCH_UPDATES_QUEUE,
        DIGEST_QUEUE,
        DEAD_LETTER_QUEUE,
        TOPIC_SUGGESTION_QUEUE,
      ].map(async (name) => {
        const queue = new Queue(name, options);
        try {
          await queue.obliterate({ force: true });
        } finally {
          await queue.close();
        }
      }),
    );
  }

  const request = () => http.request(app!.getHttpServer());

  async function waitForIndex(digest: string) {
    await expect
      .poll(
        async () =>
          (
            await db.query(
              'SELECT ready FROM topic_embedding_indexes WHERE version = $1',
              [recipe(digest)],
            )
          ).rows[0]?.ready,
        { timeout: 15_000, interval: 100 },
      )
      .toBe(true);
  }

  async function submit(title: string, abstract?: string): Promise<string> {
    const response = await request()
      .post(path)
      .set('Cookie', cookie())
      .send({ title, abstract })
      .expect(202);
    return response.body.data.requestId as string;
  }

  async function result(id: string, status: 'ready' | 'unavailable') {
    const read = () =>
      request().get(url(id)).set('Cookie', cookie()).expect(200);
    await expect
      .poll(async () => (await read()).body.data.status, {
        timeout: 12_000,
        interval: 150,
      })
      .toBe(status);
    return (await read()).body.data as {
      status: string;
      suggestions: {
        topicId: string;
        name: string;
        description: string | null;
      }[];
    };
  }

  it('authenticates the request, restricts reads, ranks both languages, and erases draft text', async () => {
    await waitForIndex(fixtureDigest);
    await request().post(path).send({ title: 'Private draft' }).expect(401);
    await request()
      .post(path)
      .set('Cookie', cookie())
      .send({ title: '   ' })
      .expect(400);
    await request()
      .post(path)
      .set('Cookie', cookie())
      .send({ title: 'Valid title', abstract: 'Invalid \0 abstract' })
      .expect(400);
    const viId = await submit(
      'Nghiên cứu thị giác máy tính',
      'Tóm tắt tiếng Việt',
    );
    await request().get(url(viId)).set('Cookie', cookie(otherUser)).expect(404);
    const vietnamese = await result(viId, 'ready');
    expect(vietnamese.suggestions).toHaveLength(5);
    expect(vietnamese.suggestions[0]?.topicId).toBe(vision);
    expect(vietnamese.suggestions.map(({ topicId }) => topicId)).not.toContain(
      inactive,
    );
    expect(embeddedTopics).not.toContain('Machine vision inactive');

    const enId = await submit('Information retrieval over research articles');
    expect((await result(enId, 'ready')).suggestions[0]?.topicId).toBe(
      retrieval,
    );
    const { rows } = await db.query(
      `SELECT r.title, r.abstract, j.payload FROM topic_suggestion_requests r
       JOIN background_jobs j ON j.id = r.job_id WHERE r.job_id = $1`,
      [viId],
    );
    expect(rows).toEqual([{ title: null, abstract: null, payload: {} }]);

    await db.query(
      'UPDATE research_topics SET is_active = false WHERE id = $1',
      [vision],
    );
    expect(
      (await result(viId, 'ready')).suggestions.map(({ topicId }) => topicId),
    ).not.toContain(vision);
    await db.query(
      'UPDATE research_topics SET is_active = true WHERE id = $1',
      [vision],
    );
  });

  it('skips unchanged imports and rejects a stale vector after another Topic edit', async () => {
    await waitForIndex(fixtureDigest);
    await db.query(
      'UPDATE research_topics SET name = name, description = description, last_synced_at = now() WHERE id = $1',
      [retrieval],
    );
    const row = () =>
      db.query(
        'SELECT pending_token, vector FROM topic_embeddings WHERE topic_id = $1 AND index_version = $2',
        [retrieval, recipe(fixtureDigest)],
      );
    expect((await row()).rows[0]?.pending_token).toBeNull();
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    holdTopic = {
      text: 'Information retrieval\nFirst edit',
      reached: reached.resolve,
      release: release.promise,
    };
    try {
      await db.query(
        "UPDATE research_topics SET description = 'First edit' WHERE id = $1",
        [retrieval],
      );
      await Promise.race([
        reached.promise,
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Worker did not start first edit')),
            10_000,
          ).unref();
        }),
      ]);
      const firstToken = (await row()).rows[0]?.pending_token;
      await db.query(
        "UPDATE research_topics SET description = 'Latest edit' WHERE id = $1",
        [retrieval],
      );
      expect((await row()).rows[0]?.pending_token).not.toBe(firstToken);
    } finally {
      holdTopic = undefined;
      release.resolve();
    }
    await expect
      .poll(async () => (await row()).rows[0]?.pending_token, {
        timeout: 10_000,
        interval: 100,
      })
      .toBeNull();
    expect(
      embeddedTopics.filter((input) =>
        input.startsWith('Information retrieval\n'),
      ),
    ).toEqual([
      'Information retrieval\nFirst edit',
      'Information retrieval\nLatest edit',
    ]);

    const added = randomUUID();
    await seedTopic(added, 'Quantum optics');
    const newRequest = async () => {
      await expect
        .poll(
          async () =>
            (
              await db.query(
                'SELECT vector IS NOT NULL AS indexed FROM topic_embeddings WHERE topic_id = $1',
                [added],
              )
            ).rows[0]?.indexed,
          { timeout: 10_000 },
        )
        .toBe(true);
      return submit('Phân tích quang học lượng tử');
    };
    expect(
      (await result(await newRequest(), 'ready')).suggestions[0]?.topicId,
    ).toBe(added);
  });

  it('falls back on an Ollama timeout and still creates an Article with a manually selected Topic', async () => {
    await waitForIndex(fixtureDigest);
    timeoutArticle = true;
    try {
      const id = await submit('Information retrieval', 'A private abstract');
      expect((await result(id, 'unavailable')).suggestions).toEqual([]);
    } finally {
      timeoutArticle = false;
    }

    const created = await request()
      .post('/outputs')
      .set('Cookie', cookie())
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'Article after a suggestion timeout',
        publicationDate: '2026',
        authors: [{ displayName: 'Fixture author' }],
        topicIds: [retrieval],
      })
      .expect(201);
    const { rows } = await db.query(
      'SELECT topic_id FROM output_topics WHERE output_id = $1',
      [created.body.data.outputId],
    );
    expect(rows).toEqual([{ topic_id: retrieval }]);
  });

  it('builds a new index before serving a changed model digest', async () => {
    await waitForIndex(fixtureDigest);
    await worker?.close();
    modelDigest = otherDigest;
    process.env.OLLAMA_EMBEDDING_DIGEST = otherDigest;
    worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    await waitForIndex(otherDigest);
    const { rows } = await db.query(
      'SELECT ready FROM topic_embedding_indexes ORDER BY version',
    );
    expect(rows).toEqual([{ ready: true }, { ready: true }]);
    expect(
      (await result(await submit('Information retrieval'), 'ready'))
        .suggestions[0]?.topicId,
    ).toBe(retrieval);
  });

  it('ignores a claim invalidated before reading the Topic text', async () => {
    const index = worker!.get(TopicEmbeddingIndexService) as unknown as {
      refreshBatch(
        version: string,
        batch: { topic_id: string }[],
      ): Promise<boolean>;
    };
    const id = randomUUID();
    const originalRefresh = index.refreshBatch.bind(index);
    let changed = false;
    const spy = vi
      .spyOn(index, 'refreshBatch')
      .mockImplementation(async (version, batch) => {
        if (!changed && batch.some(({ topic_id }) => topic_id === id)) {
          changed = true;
          await db.query(
            "UPDATE research_topics SET name = 'Current claim Topic' WHERE id = $1",
            [id],
          );
        }
        return originalRefresh(version, batch);
      });
    try {
      await seedTopic(id, 'Superseded claim Topic');
      await expect
        .poll(() => embeddedTopics.includes('Current claim Topic'), {
          timeout: 10_000,
        })
        .toBe(true);
      expect(embeddedTopics).not.toContain('Superseded claim Topic');
    } finally {
      spy.mockRestore();
      await db.query('DELETE FROM research_topics WHERE id = $1', [id]);
    }
  });

  it('publishes the valid Topics after isolating failing inputs during index creation', async () => {
    await worker?.close();
    const digest = 'c'.repeat(64);
    modelDigest = digest;
    process.env.OLLAMA_EMBEDDING_DIGEST = digest;
    const invalidVector = randomUUID();
    const rejectedInput = randomUUID();
    const invalidIds = [invalidVector, rejectedInput];
    await seedTopic(invalidVector, 'Invalid embedding Topic');
    await seedTopic(rejectedInput, 'Rejected input Topic');
    worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    const rows = () =>
      db.query(
        'SELECT failed_attempts, pending_token, vector FROM topic_embeddings WHERE index_version = $1 AND topic_id = ANY($2::uuid[])',
        [recipe(digest), invalidIds],
      );
    try {
      for (const attempt of [1, 2]) {
        await expect
          .poll(
            async () =>
              (await rows()).rows.map(
                (row: { failed_attempts: number }) => row.failed_attempts,
              ),
            { timeout: 10_000 },
          )
          .toEqual([attempt, attempt]);
        // Make the fixture retry eligible immediately instead of waiting for the real lease.
        await db.query(
          'UPDATE topic_embeddings SET next_attempt_at = now() WHERE index_version = $1 AND topic_id = ANY($2::uuid[])',
          [recipe(digest), invalidIds],
        );
      }
      await waitForIndex(digest);
      expect((await rows()).rows).toEqual(
        Array(2).fill({
          failed_attempts: 3,
          pending_token: null,
          vector: null,
        }),
      );
      const { suggestions } = await result(
        await submit('Information retrieval'),
        'ready',
      );
      expect(suggestions[0]?.topicId).toBe(retrieval);
      expect(
        suggestions
          .map(({ topicId }) => topicId)
          .filter((id) => invalidIds.includes(id)),
      ).toEqual([]);
      await db.query(
        "UPDATE research_topics SET name = 'Corrected embedding Topic' WHERE id = $1",
        [invalidVector],
      );
      await expect
        .poll(
          async () =>
            (
              await db.query(
                'SELECT failed_attempts, vector IS NOT NULL AS indexed FROM topic_embeddings WHERE index_version = $1 AND topic_id = $2',
                [recipe(digest), invalidVector],
              )
            ).rows[0],
          { timeout: 10_000 },
        )
        .toEqual({ failed_attempts: 0, indexed: true });
    } finally {
      await db.query('DELETE FROM research_topics WHERE id = ANY($1::uuid[])', [
        invalidIds,
      ]);
    }
  });

  it('recovers an already-dispatched suggestion missing from Redis before the deadline', async () => {
    await waitForIndex(modelDigest);
    await worker?.close();
    const id = await submit('Information retrieval');
    await db.query(
      "UPDATE outbox SET dispatched_at = now() - interval '4 seconds' WHERE job_id = $1",
      [id],
    );
    worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    await waitForIndex(modelDigest);
    expect((await result(id, 'ready')).suggestions[0]?.topicId).toBe(retrieval);
  });

  it('keeps the worker running with invalid Ollama configuration and sweeps the draft in the API', async () => {
    await worker?.close();
    process.env.OLLAMA_EMBEDDING_DIGEST = 'invalid';
    worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });
    const id = await submit('Information retrieval', 'Expired private draft');
    await db.query(
      'UPDATE topic_suggestion_requests SET deadline_at = now() WHERE job_id = $1',
      [id],
    );
    expect((await result(id, 'unavailable')).suggestions).toEqual([]);
    const job = await request()
      .get(`/jobs/${id}`)
      .set('Cookie', cookie())
      .expect(200);
    expect(job.body.data.status).toBe('COMPLETED');
    await expect
      .poll(
        async () =>
          (
            await db.query(
              `SELECT r.title, r.abstract, j.status
               FROM topic_suggestion_requests r JOIN background_jobs j ON j.id = r.job_id
               WHERE r.job_id = $1`,
              [id],
            )
          ).rows[0],
        { timeout: 8_000 },
      )
      .toEqual({ title: null, abstract: null, status: 'COMPLETED' });
    expect(
      (
        await db.query('SELECT dispatched_at FROM outbox WHERE job_id = $1', [
          id,
        ])
      ).rows,
    ).toEqual([{ dispatched_at: null }]);
  });
});
