import 'reflect-metadata';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@researchos/database';
import {
  ARTICLE_PDF_METADATA_JOB,
  ARTICLE_PDF_METADATA_QUEUE,
  BACKGROUND_QUEUE,
  DEAD_LETTER_QUEUE,
  RESEARCH_UPDATES_QUEUE,
  SYSTEM_QUEUE,
  TOPIC_SUGGESTION_QUEUE,
  articlePdfMetadataScope,
  backgroundTransportId,
  createQueueOptions,
} from '@researchos/queue';
import { Ajv } from 'ajv';
import {
  createS3Storage,
  StorageObjectNotFoundError,
  type StorageAdapter,
} from '@researchos/storage';
import { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHttpTestClient } from './http-test-client.js';

const { Client } = createRequire(import.meta.resolve('@researchos/database'))(
  'pg',
);
const migrationRoot = new URL(
  '../../../packages/database/prisma/migrations/',
  import.meta.url,
);
const articleMigration = '20261118150000_article_creation';
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
);
const pdfSha256 = createHash('sha256').update(pdf).digest('hex');

function pdfWithMetadata(lines = ['Published: 2024-05']): Buffer<ArrayBuffer> {
  const text = [
    'Title: Water quality',
    'Authors: Mai Nguyen; Bao Tran',
    ...lines,
  ]
    .map((line) => `(${line}) Tj`)
    .join(' T* ');
  const pageText = `BT /F1 12 Tf 14 TL 72 720 Td ${text} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${pageText.length} >>\nstream\n${pageText}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Title (Water quality) /Author (Mai Nguyen; Bao Tran) /CreationDate (D:20251101) >>',
  ];
  let source = '%PDF-1.4\n';
  const offsets = ['0000000000 65535 f \n'];
  for (const [index, object] of objects.entries()) {
    offsets.push(String(source.length).padStart(10, '0') + ' 00000 n \n');
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = source.length;
  source += `xref\n0 ${offsets.length}\n${offsets.join('')}trailer\n`;
  source += `<< /Root 1 0 R /Info 6 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

function createTestStorage(): StorageAdapter {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  return {
    async createUploadUrl({ contentType }) {
      return {
        url: 'https://storage.article.test.invalid/upload',
        headers: { 'content-type': contentType },
      };
    },
    async headObject(key) {
      const object = objects.get(key);
      return object
        ? { sizeBytes: object.bytes.length, contentType: object.contentType }
        : null;
    },
    async getObject(key, signal) {
      signal?.throwIfAborted();
      const object = objects.get(key);
      if (!object) throw new StorageObjectNotFoundError(undefined);
      return Readable.from([object.bytes]);
    },
    async putObject(key, bytes, contentType) {
      objects.set(key, { bytes: Buffer.from(bytes), contentType });
      return { sizeBytes: bytes.length, contentType };
    },
    async deleteObject(key) {
      objects.delete(key);
    },
  };
}

describe('Article creation', () => {
  const actors = {
    owner: randomUUID(),
    researcher: randomUUID(),
    reader: randomUUID(),
  };
  type Actor = keyof typeof actors;
  const cookies = new Map<Actor, string>();
  const activeTopic = randomUUID();
  const secondTopic = randomUUID();
  const inactiveTopic = randomUUID();
  const legacyOutput = randomUUID();
  const legacyRevision = randomUUID();
  const aliasRevision = randomUUID();
  const datasetRevision = randomUUID();
  const importedOutput = randomUUID();
  const importedDoi = '10.1234/openalex#candidate';
  const literalPercentDoi = '10.1234/literal%23doi';
  const importedOrcid = '0000-0002-1825-0097';
  const input = {
    title: 'A new Article',
    publicationDate: '2026',
    authors: [{ displayName: 'owner' }],
  };
  const http = createHttpTestClient();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalQueuePrefix = process.env.QUEUE_PREFIX;
  const databaseName = `article_creation_${randomUUID().replaceAll('-', '')}`;
  let admin: InstanceType<typeof Client>;
  let db: InstanceType<typeof Client>;
  const adminSocket = new Socket();
  const dbSocket = new Socket();
  let databaseCreated = false;
  let app: INestApplication;
  let originalRevision: Record<string, unknown>;
  let originalSearchTimestamp: string;
  let storage: StorageAdapter;
  let sweepExpiredUploads: () => Promise<void>;
  let workerStarted = false;
  const objectKeys = new Set<string>();
  const useLocalS3 =
    process.env.CI === 'true' ||
    process.env.ARTICLE_UPLOAD_E2E_STORAGE === 'seaweedfs';

  async function readLegacyRevision() {
    const result = await db.query(
      `SELECT title, output_type, released_at::text, updated_at::text
       FROM output_revisions WHERE id = $1`,
      [legacyRevision],
    );
    return result.rows[0];
  }

  async function readLegacySearchTimestamp(): Promise<string> {
    const { rows } = await db.query(
      "SELECT updated_at::text FROM search_index WHERE entity_type = 'OUTPUT' AND entity_id = $1",
      [legacyOutput],
    );
    return rows[0].updated_at;
  }

  async function seedLegacy() {
    for (const [role, id] of Object.entries(actors) as [Actor, string][]) {
      await db.query(
        `INSERT INTO users (id, user_type, email, full_name, department_unit)
         VALUES ($1, $2, $3, $4, 'Integration')`,
        [
          id,
          role === 'reader' ? 'STAFF' : 'FACULTY',
          `${role}@article.test.invalid`,
          role,
        ],
      );
      await db.query(
        `INSERT INTO local_credentials (user_id, password_hash, must_change_password)
         VALUES ($1, 'TEST_ONLY_NOT_A_LOGIN_HASH', false)`,
        [id],
      );
      const token = randomUUID();
      await db.query(
        `INSERT INTO user_sessions (user_id, auth_method, session_token_hash,
           authenticated_at, expires_at, idle_expires_at)
         VALUES ($1, 'LOCAL', $2, now(), now() + interval '1 day', now() + interval '1 hour')`,
        [id, createHash('sha256').update(token).digest('hex')],
      );
      cookies.set(role, `researchos_session=${token}`);
    }

    await db.query(
      'INSERT INTO researcher_profiles (user_id, orcid_id) VALUES ($1, $2)',
      [actors.researcher, importedOrcid],
    );
    await db.query(
      `INSERT INTO research_outputs (id, owner_id, created_by, doi, import_state)
       VALUES ($1, $3, $3, $4, 'NONE'), ($2, NULL, $5, $6, 'CANDIDATE')`,
      [
        legacyOutput,
        importedOutput,
        actors.owner,
        literalPercentDoi,
        actors.researcher,
        'https://doi.org/10.1234/openalex%23candidate',
      ],
    );
    await db.query(
      `INSERT INTO output_revisions
         (id, output_id, revision_no, title, output_type, publication_year,
          created_by, released_by, released_at, authors_snapshot)
       VALUES ($1, $4, 1, 'Legacy paper', 'PAPER', 2020, $6, $6, clock_timestamp(),
               '[{"name":"Legacy author","order":1},
                 {"name":"Outside author","order":2},
                 {"name":"Older display name","order":3},
                 {"name":"Explicitly unlinked","order":4,"userId":null,"isCorresponding":false}]'),
              ($2, $4, 2, 'Legacy draft', ' paper ', NULL, $6, NULL, NULL, '[]'),
              ($3, $5, 1, 'Imported dataset', 'DATASET', NULL, $6, NULL, NULL, '[]')`,
      [
        legacyRevision,
        aliasRevision,
        datasetRevision,
        legacyOutput,
        importedOutput,
        actors.owner,
      ],
    );
    await db.query(
      `INSERT INTO output_authors
         (output_id, author_name_string, author_order, user_id, is_corresponding_author)
       VALUES ($1, 'Legacy author', 1, $2, true),
              ($1, 'Outside author', 2, NULL, false),
              ($1, 'Newer display name', 3, $3, false),
              ($1, 'Explicitly unlinked', 4, $4, true)`,
      [legacyOutput, actors.owner, actors.researcher, actors.reader],
    );
    // The legacy fixture is seeded before the scope migration runs, so it
    // still uses the old `visibility` column. The migration converts it.
    await db.query(
      `UPDATE research_outputs SET current_release_id = $1, sharing_status = 'SHARED',
         first_shared_at = clock_timestamp(), visibility = 'FPTU_COMMUNITY' WHERE id = $2`,
      [legacyRevision, legacyOutput],
    );
    originalRevision = await readLegacyRevision();
    originalSearchTimestamp = await readLegacySearchTimestamp();
  }

  beforeAll(async () => {
    process.env.QUEUE_PREFIX = databaseName;
    if (!originalDatabaseUrl) {
      throw new Error('DATABASE_URL is required for the Article API tests');
    }
    const source = new URL(originalDatabaseUrl);
    source.pathname = '/postgres';
    source.searchParams.delete('schema');
    const databaseUrl = new URL(source);
    databaseUrl.pathname = `/${databaseName}`;

    admin = new Client({ connectionString: source.href, stream: adminSocket });
    db = new Client({ connectionString: databaseUrl.href, stream: dbSocket });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await db.connect();
    const entries = await readdir(migrationRoot, { withFileTypes: true });
    const migrations = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) {
      if (migration === articleMigration) await seedLegacy();
      await db.query(
        await readFile(
          new URL(`${migration}/migration.sql`, migrationRoot),
          'utf8',
        ),
      );
    }
    const fieldId = randomUUID();
    const subfieldId = randomUUID();
    await db.query(
      "INSERT INTO research_fields (id, name, source) VALUES ($1, 'Field', 'LOCAL')",
      [fieldId],
    );
    await db.query(
      "INSERT INTO research_subfields (id, field_id, name, source) VALUES ($1, $2, 'Subfield', 'LOCAL')",
      [subfieldId, fieldId],
    );
    await db.query(
      `INSERT INTO research_topics (id, subfield_id, name, created_by)
       VALUES ($1, $4, 'Topic 1', $5), ($2, $4, 'Topic 2', $5), ($3, $4, 'Inactive topic', $5)`,
      [activeTopic, secondTopic, inactiveTopic, subfieldId, actors.owner],
    );
    await db.query(
      'UPDATE research_topics SET is_active = false WHERE id = $1',
      [inactiveTopic],
    );

    process.env.DATABASE_URL = databaseUrl.href;
    const { IdentityModule } =
      await import('../dist/modules/identity/identity.module.js');
    const { OutputsModule } =
      await import('../dist/modules/outputs/outputs.module.js');
    const { FileAccessModule } =
      await import('../dist/modules/file-access/file-access.module.js');
    const { ObjectStorageService } =
      await import('../dist/modules/storage/object-storage.service.js');
    const { StorageModule } =
      await import('../dist/modules/storage/storage.module.js');
    const { ArticleCreationUploadCleanupService } =
      await import('../dist/modules/storage/article-creation-upload-cleanup.service.js');
    const { OpenAlexModule } =
      await import('../dist/modules/openalex/openalex.module.js');
    const { HttpExceptionFilter } =
      await import('../dist/common/filters/http-exception.filter.js');
    const { ApiResponseInterceptor } =
      await import('../dist/common/interceptors/api-response.interceptor.js');
    if (useLocalS3) {
      const endpoint = process.env.S3_ENDPOINT
        ? new URL(process.env.S3_ENDPOINT)
        : null;
      if (
        !endpoint ||
        !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
      ) {
        throw new Error(
          'SeaweedFS integration tests need a loopback S3 endpoint',
        );
      }
    }
    storage = useLocalS3 ? createS3Storage() : createTestStorage();
    const objectStorage = new ObjectStorageService();
    vi.spyOn(objectStorage, 'adapter', 'get').mockReturnValue(storage);
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: 1_000 },
        ]),
        PrismaModule,
        IdentityModule,
        OutputsModule,
        FileAccessModule,
        StorageModule,
        OpenAlexModule,
      ],
    })
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorage)
      .compile();
    const cleanup = fixture.get(ArticleCreationUploadCleanupService);
    sweepExpiredUploads = () => cleanup.sweepExpiredUploads();
    app = fixture.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        errorFormat: 'grouped',
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    http.close();
    try {
      const appCleanup = await Promise.allSettled([app?.close()]);
      const fixtureCleanup = await Promise.allSettled([
        dropTestDatabase(),
        ...[...objectKeys].map((key) => storage.deleteObject(key)),
        ...(workerStarted ? [clearWorkerQueues()] : []),
      ]);
      const errors = [...appCleanup, ...fixtureCleanup].flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      if (errors.length) {
        throw new AggregateError(errors, 'Article fixture cleanup failed');
      }
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalQueuePrefix === undefined) delete process.env.QUEUE_PREFIX;
      else process.env.QUEUE_PREFIX = originalQueuePrefix;
    }
  });

  async function dropTestDatabase(): Promise<void> {
    try {
      const closed = db?.end();
      // No queries remain. Close the fixture-owned TCP socket locally so the
      // database drop does not wait for the peer to close the connection.
      dbSocket.destroy();
      await closed;
      if (databaseCreated) {
        await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      }
    } finally {
      const closed = admin?.end();
      adminSocket.destroy();
      await closed;
    }
  }

  async function clearWorkerQueues(): Promise<void> {
    const options = createQueueOptions(process.env.REDIS_URL!, databaseName);
    // The worker has already exited. Delete only queues in this run's UUID prefix.
    for (const name of [
      ARTICLE_PDF_METADATA_QUEUE,
      TOPIC_SUGGESTION_QUEUE,
      BACKGROUND_QUEUE,
      DEAD_LETTER_QUEUE,
      RESEARCH_UPDATES_QUEUE,
      SYSTEM_QUEUE,
    ]) {
      const queue = new Queue(name, options);
      try {
        await queue.obliterate({ force: true });
      } finally {
        await queue.close();
      }
    }
  }

  function submit(
    body: object,
    key: string | null = randomUUID(),
    actor: Actor = 'owner',
  ) {
    const request = http
      .request(app.getHttpServer())
      .post('/outputs')
      .set('Cookie', cookies.get(actor)!);
    if (key !== null) request.set('Idempotency-Key', key);
    return request.send(body);
  }

  function detail(id: string) {
    return http
      .request(app.getHttpServer())
      .get(`/outputs/${id}`)
      .set('Cookie', cookies.get('reader')!);
  }

  const uploadEndpoint = '/outputs/creation-uploads';
  const pdfInput = {
    fileName: 'article.pdf',
    mimeType: 'application/pdf',
    sizeBytes: pdf.length,
    sha256: pdfSha256,
  };

  function request(actor: Actor) {
    const cookie = cookies.get(actor)!;
    const client = http.request(app.getHttpServer());
    return {
      get: (path: string) => client.get(path).set('Cookie', cookie),
      post: (path: string) => client.post(path).set('Cookie', cookie),
      put: (path: string) => client.put(path).set('Cookie', cookie),
      patch: (path: string) => client.patch(path).set('Cookie', cookie),
      delete: (path: string) => client.delete(path).set('Cookie', cookie),
    };
  }

  async function preparePdf(details = pdfInput) {
    const { body } = await request('owner')
      .post(uploadEndpoint)
      .send(details)
      .expect(201);
    const { uploadId, uploadUrl, headers, expiresAt } = body.data as {
      uploadId: string;
      uploadUrl: string;
      headers: Record<string, string>;
      expiresAt: string;
    };
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
    const { rows } = await db.query(
      'SELECT storage_key FROM article_creation_uploads WHERE id = $1',
      [uploadId],
    );
    const key: string = rows[0].storage_key;
    objectKeys.add(key);
    return { uploadId, uploadUrl, headers, key };
  }

  async function putPdf(
    upload: Awaited<ReturnType<typeof preparePdf>>,
    bytes = pdf,
  ) {
    if (useLocalS3) {
      const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      const preflight = await fetch(upload.uploadUrl, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'PUT',
          'access-control-request-headers': Object.keys(upload.headers).join(
            ',',
          ),
        },
      });
      expect(preflight.ok).toBe(true);
      expect([origin, '*']).toContain(
        preflight.headers.get('access-control-allow-origin'),
      );
      const allowedMethods = preflight.headers
        .get('access-control-allow-methods')
        ?.split(/\s*,\s*/);
      expect(
        allowedMethods?.some((method) => method === 'PUT' || method === '*'),
      ).toBe(true);
      const allowedHeaders = preflight.headers
        .get('access-control-allow-headers')
        ?.toLowerCase()
        .split(/\s*,\s*/);
      expect(
        allowedHeaders?.includes('*') ||
          Object.keys(upload.headers).every((header) =>
            allowedHeaders?.includes(header.toLowerCase()),
          ),
      ).toBe(true);
      const response = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: upload.headers,
        body: bytes,
      });
      if (!response.ok) {
        throw new Error(`SeaweedFS presigned PUT failed (${response.status})`);
      }
      return;
    }
    await storage.putObject(upload.key, bytes, pdfInput.mimeType);
  }

  async function verifiedPdf(bytes = pdf, confirmWithUppercaseId = false) {
    const upload = await preparePdf({
      ...pdfInput,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    await putPdf(upload, bytes);
    const confirmId = confirmWithUppercaseId
      ? upload.uploadId.toUpperCase()
      : upload.uploadId;
    await request('owner')
      .post(`${uploadEndpoint}/${confirmId}/confirm`)
      .expect(200);
    return upload;
  }

  function startArticleWorker(overrides: NodeJS.ProcessEnv = {}) {
    const worker = spawn(
      process.execPath,
      [fileURLToPath(new URL('../../worker/dist/main.js', import.meta.url))],
      {
        env: {
          ...process.env,
          DIGEST_SMTP_ENABLED: 'false',
          ARTICLE_PDF_GROBID_URL: '',
          ...overrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    workerStarted ||= Boolean(worker.pid);
    let logs = '';
    worker.stdout.on('data', (chunk: Buffer) => {
      logs += chunk.toString();
    });
    worker.stderr.on('data', (chunk: Buffer) => {
      logs += chunk.toString();
    });
    return {
      get logs() {
        return logs;
      },
      async stop() {
        if (worker.exitCode === null && worker.signalCode === null) {
          const exited = once(worker, 'exit');
          worker.kill();
          await exited;
        }
      },
    };
  }

  it.runIf(useLocalS3)(
    'extracts PDF suggestions and reports document or storage failures through the owner status API',
    async () => {
      const spec: { components: object } = JSON.parse(
        await readFile(new URL('../openapi.json', import.meta.url), 'utf8'),
      );
      const validateStatus = new Ajv({
        strict: false,
        validateFormats: false,
      }).compile({
        components: spec.components,
        $ref: '#/components/schemas/ArticlePdfUploadStatusDto',
      });
      const upload = await verifiedPdf(pdfWithMetadata(), true);
      const path = `${uploadEndpoint}/${upload.uploadId}`;
      const queued = await request('owner').get(path).expect(200);
      expect(queued.body.data.metadataStatus).toBe('QUEUED');
      const replay = await request('owner').post(`${path}/confirm`).expect(200);
      expect(replay.body.data).toEqual(queued.body.data);
      expect(
        validateStatus(replay.body.data),
        JSON.stringify(validateStatus.errors),
      ).toBe(true);
      const jobs = await db.query(
        'SELECT id, idempotency_key, payload, queue_prefix FROM background_jobs WHERE owner_id = $1 AND kind = $2',
        [actors.owner, ARTICLE_PDF_METADATA_JOB],
      );
      expect(jobs.rows).toEqual([
        {
          id: expect.any(String),
          idempotency_key: upload.uploadId,
          payload: { uploadId: upload.uploadId },
          queue_prefix: articlePdfMetadataScope(databaseName),
        },
      ]);
      const legacyScope = `@research-updates:${createHash('sha256').update(databaseName).digest('hex')}`;
      const legacyRows = await db.query(
        `SELECT o.id FROM outbox o JOIN background_jobs j ON j.id = o.job_id
         WHERE o.job_id = $1 AND j.queue_prefix IN ($2, $3)`,
        [jobs.rows[0].id, databaseName, legacyScope],
      );
      expect(legacyRows.rowCount).toBe(0);
      const full = await verifiedPdf(
        pdfWithMetadata([
          'Abstract: A study of river samples.',
          'Keywords: water',
          'Published: 2024-05-17',
          'DOI: https://doi.org/10.1234/water.2024%28supplement%29',
        ]),
      );
      const invalid = await verifiedPdf();
      const unsupportedBytes = Buffer.from('This is not a PDF.');
      const unsupported = await preparePdf({
        ...pdfInput,
        sizeBytes: unsupportedBytes.length,
        sha256: createHash('sha256').update(unsupportedBytes).digest('hex'),
      });
      await putPdf(unsupported, unsupportedBytes);
      await request('owner')
        .post(`${uploadEndpoint}/${unsupported.uploadId}/confirm`)
        .expect(409);
      // A blank PDF protected with a non-empty user password.
      const encryptedBytes = Buffer.from(
        await readFile(
          new URL('./fixtures/encrypted-article.pdf.base64', import.meta.url),
          'utf8',
        ),
        'base64',
      );
      const encrypted = await verifiedPdf(encryptedBytes);
      const missingObject = await verifiedPdf();
      await storage.deleteObject(missingObject.key);
      const expired = await verifiedPdf();
      await db.query(
        `
        UPDATE article_creation_uploads SET created_at = now() - interval '2 hours',
          expires_at = now() - interval '1 hour' WHERE id = $1
      `,
        [expired.uploadId],
      );
      const consumed = await verifiedPdf();
      await submit({
        ...input,
        uploadId: consumed.uploadId,
        fileVisibility: 'PRIVATE',
      }).expect(201);

      const worker = startArticleWorker();
      try {
        await expect
          .poll(
            async () => {
              const response = await request('owner').get(path).expect(200);
              return response.body.data;
            },
            { timeout: 20_000, interval: 200 },
          )
          .toMatchObject({
            status: 'VERIFIED',
            metadataStatus: 'READY',
            metadataErrorCode: null,
            metadata: {
              title: 'Water quality',
              authorNames: ['Mai Nguyen', 'Bao Tran'],
              publicationDate: '2024-05',
            },
          });
        const options = createQueueOptions(
          process.env.REDIS_URL!,
          databaseName,
        );
        const articleQueue = new Queue(ARTICLE_PDF_METADATA_QUEUE, options);
        const legacyQueue = new Queue(BACKGROUND_QUEUE, options);
        try {
          const transportId = backgroundTransportId(jobs.rows[0].id, 0);
          expect(await articleQueue.getJob(transportId)).toBeDefined();
          expect(await legacyQueue.getJob(transportId)).toBeUndefined();
        } finally {
          await Promise.all([articleQueue.close(), legacyQueue.close()]);
        }
        await request('researcher').get(path).expect(404);
        const status = async (id: string) => {
          const response = await request('owner')
            .get(`${uploadEndpoint}/${id}`)
            .expect(200);
          expect(
            validateStatus(response.body.data),
            JSON.stringify(validateStatus.errors),
          ).toBe(true);
          return response.body.data;
        };
        const pollStatus = (id: string) =>
          expect.poll(() => status(id), { timeout: 10_000, interval: 200 });
        await pollStatus(full.uploadId).toMatchObject({
          metadataStatus: 'READY',
          metadata: {
            abstract: 'A study of river samples.',
            publicationDate: '2024-05-17',
            doi: '10.1234/water.2024(supplement)',
          },
        });
        const fullStatus = await status(full.uploadId);
        const published = await submit({
          ...input,
          doi: fullStatus.metadata.doi,
          uploadId: full.uploadId,
          fileVisibility: 'PRIVATE',
        }).expect(201);
        expect(
          (await detail(published.body.data.outputId).expect(200)).body.data
            .doi,
        ).toBe('10.1234/water.2024(supplement)');
        const failures = [
          [invalid, 'article_pdf_metadata_corrupt'],
          [encrypted, 'article_pdf_metadata_encrypted'],
          [missingObject, 'article_pdf_metadata_unavailable'],
        ] as const;
        for (const [failed, code] of failures) {
          await pollStatus(failed.uploadId).toMatchObject({
            status: 'VERIFIED',
            metadataStatus: 'FAILED',
            metadataErrorCode: code,
            metadata: null,
          });
        }
        const attempts = await db.query(
          "SELECT attempts FROM background_jobs WHERE idempotency_key = $1 AND kind = 'article-pdf-metadata'",
          [missingObject.uploadId],
        );
        expect(attempts.rows[0].attempts).toBe(3);
        expect(await status(expired.uploadId)).toMatchObject({
          status: 'EXPIRED',
          metadata: null,
        });
        await expect
          .poll(async () => {
            const job = await db.query(
              'SELECT status, result FROM background_jobs WHERE idempotency_key = $1 AND kind = $2',
              [consumed.uploadId, ARTICLE_PDF_METADATA_JOB],
            );
            return job.rows[0];
          })
          .toEqual({ status: 'COMPLETED', result: null });
        expect(await status(consumed.uploadId)).toMatchObject({
          status: 'CONSUMED',
          metadataStatus: 'NOT_STARTED',
          metadata: null,
        });
        await submit({
          ...input,
          uploadId: invalid.uploadId,
          fileVisibility: 'PRIVATE',
        }).expect(201);
      } catch (error) {
        throw new Error(
          `PDF metadata test failed. Worker output:\n${worker.logs}`,
          {
            cause: error,
          },
        );
      } finally {
        await worker.stop();
      }
    },
    45_000,
  );

  it.runIf(useLocalS3)(
    'enriches verified text PDFs and keeps partial metadata available through GROBID failure and timeout',
    async () => {
      const requests: Array<{ path?: string; body: string }> = [];
      const server = createServer(async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks).toString();
        requests.push({ path: req.url, body });
        if (body.includes('Timeout example')) return;
        if (body.includes('Unavailable example')) {
          res.writeHead(503).end();
          return;
        }
        res
          .writeHead(200, { 'content-type': 'application/xml' })
          .end(
            '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader>' +
              '<fileDesc><sourceDesc><biblStruct><analytic><idno type="DOI">10.1234/clarity</idno></analytic></biblStruct></sourceDesc></fileDesc>' +
              '<profileDesc><abstract><p>Samples showed improved water clarity.</p></abstract></profileDesc>' +
              '</teiHeader></TEI>',
          );
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const port = (server.address() as { port: number }).port;
      const worker = startArticleWorker({
        ARTICLE_PDF_GROBID_URL: `http://127.0.0.1:${port}`,
        ARTICLE_PDF_GROBID_TIMEOUT_MS: '1000',
      });

      try {
        const created = await Promise.all(
          ['Success', 'Unavailable', 'Timeout'].map((kind) =>
            verifiedPdf(
              pdfWithMetadata([
                `${kind} example with enough readable text.`,
                'Published: 2024-05',
                ...(kind === 'Success' ? ['10.1234/clarity'] : []),
              ]),
            ),
          ),
        );
        for (const [index, upload] of created.entries()) {
          const path = `${uploadEndpoint}/${upload.uploadId}`;
          await expect
            .poll(
              async () =>
                (await request('owner').get(path).expect(200)).body.data,
              { timeout: 12_000, interval: 200 },
            )
            .toMatchObject({ status: 'VERIFIED', metadataStatus: 'READY' });
          const { data } = (await request('owner').get(path).expect(200)).body;
          expect(data.metadata).toEqual({
            title: 'Water quality',
            authorNames: ['Mai Nguyen', 'Bao Tran'],
            publicationDate: '2024-05',
            ...(index === 0 && {
              doi: '10.1234/clarity',
            }),
          });
          await request('researcher').get(path).expect(404);
        }
        expect(requests).toHaveLength(3);
        for (const sent of requests) {
          expect(sent.path).toBe('/api/processHeaderDocument');
          expect(sent.body).toContain('%PDF-1.4');
          expect(sent.body).toContain('name="consolidateHeader"\r\n\r\n0');
        }
        await submit({
          ...input,
          uploadId: created[1].uploadId,
          fileVisibility: 'PRIVATE',
        }).expect(201);
        await request('owner')
          .get(`${uploadEndpoint}/${created[1].uploadId}`)
          .expect(200)
          .expect(({ body }) => expect(body.data.status).toBe('CONSUMED'));
      } catch (error) {
        throw new Error(`GROBID test failed. Worker output:\n${worker.logs}`, {
          cause: error,
        });
      } finally {
        await worker.stop();
        const closed = once(server, 'close');
        server.close();
        server.closeAllConnections();
        await closed;
      }
    },
    30_000,
  );

  it('distinguishes a completed job without a result from an empty extraction', async () => {
    const upload = await verifiedPdf();
    const path = `${uploadEndpoint}/${upload.uploadId}`;
    await db.query(
      "UPDATE background_jobs SET status = 'COMPLETED' WHERE idempotency_key = $1 AND kind = $2",
      [upload.uploadId, ARTICLE_PDF_METADATA_JOB],
    );
    expect(
      (await request('owner').get(path).expect(200)).body.data,
    ).toMatchObject({
      status: 'VERIFIED',
      metadataStatus: 'NOT_STARTED',
      metadata: null,
    });
    await db.query(
      "UPDATE background_jobs SET result = '{}'::jsonb WHERE idempotency_key = $1 AND kind = $2",
      [upload.uploadId, ARTICLE_PDF_METADATA_JOB],
    );
    expect(
      (await request('owner').get(path).expect(200)).body.data,
    ).toMatchObject({
      status: 'VERIFIED',
      metadataStatus: 'READY',
      metadata: {},
    });
  });

  it('enqueues metadata on reconfirm of a previously verified upload', async () => {
    const upload = await preparePdf();
    await putPdf(upload);
    await db.query(
      'UPDATE article_creation_uploads SET verified_at = now() WHERE id = $1',
      [upload.uploadId],
    );
    const path = `${uploadEndpoint}/${upload.uploadId}`;
    const initial = await request('owner').get(path).expect(200);
    expect(initial.body.data).toMatchObject({
      status: 'VERIFIED',
      metadataStatus: 'NOT_STARTED',
    });

    const confirmed = await request('owner')
      .post(`${path}/confirm`)
      .expect(200);
    expect(confirmed.body.data).toMatchObject({
      status: 'VERIFIED',
      metadataStatus: 'QUEUED',
    });
  });

  it('rejects invalid PDF upload JSON with a translatable code for each field', async () => {
    const response = await request('owner')
      .post(uploadEndpoint)
      .send({
        fileName: 123,
        mimeType: 'text/plain',
        sizeBytes: true,
        sha256: 'bad',
      })
      .expect(400);
    expect(response.body.message).toBe('validation_failed');
    expect(response.body.errors).toHaveLength(4);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        { field: 'fileName', messages: ['article_pdf_file_name_invalid'] },
        { field: 'mimeType', messages: ['article_pdf_mime_type_invalid'] },
        { field: 'sizeBytes', messages: ['article_pdf_size_invalid'] },
        { field: 'sha256', messages: ['article_pdf_sha256_invalid'] },
      ]),
    );

    for (const sizeBytes of [
      String(pdfInput.sizeBytes),
      0,
      1.5,
      50 * 1024 ** 2 + 1,
    ]) {
      const invalid = await request('owner')
        .post(uploadEndpoint)
        .send({ ...pdfInput, sizeBytes })
        .expect(400);
      expect(invalid.body.errors).toEqual([
        { field: 'sizeBytes', messages: ['article_pdf_size_invalid'] },
      ]);
    }
  });

  it('verifies an owner upload and atomically releases a Private PDF with exactly-once create', async () => {
    await request('reader').post(uploadEndpoint).send(pdfInput).expect(403);
    const upload = await preparePdf();
    const path = `${uploadEndpoint}/${upload.uploadId}`;
    const submission = {
      ...input,
      uploadId: upload.uploadId,
      fileVisibility: 'PRIVATE',
    };
    await request('researcher').get(path).expect(404);
    await request('researcher').post(`${path}/confirm`).expect(404);
    await submit(submission, randomUUID(), 'researcher').expect(404);
    const pending = await request('owner').get(path).expect(200);
    expect(pending.body.data).toMatchObject({
      status: 'PENDING',
      metadataStatus: 'NOT_STARTED',
    });
    await submit(submission).expect(409);

    await putPdf(upload);
    if (useLocalS3) {
      const duplicatePut = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: upload.headers,
        body: pdf,
      });
      expect(duplicatePut.status).toBe(412);
      await duplicatePut.body?.cancel();
    }
    const confirms = await Promise.all([
      request('owner').post(`${path}/confirm`).expect(200),
      request('owner').post(`${path}/confirm`).expect(200),
    ]);
    expect(confirms[0].body.data).toEqual(confirms[1].body.data);
    expect(confirms[0].body.data.status).toBe('VERIFIED');
    expect(confirms[0].body.data.metadataStatus).toBe('QUEUED');
    const jobs = await db.query(
      "SELECT id FROM background_jobs WHERE kind = 'article-pdf-metadata' AND idempotency_key = $1",
      [upload.uploadId],
    );
    expect(jobs.rowCount).toBe(1);

    const key = randomUUID();
    const [original, replay] = await Promise.all([
      submit(submission, key).expect(201),
      submit(submission, key).expect(201),
    ]);
    expect(original.body.data).toEqual(replay.body.data);
    await submit(
      { ...submission, fileVisibility: 'FPTU_COMMUNITY' },
      key,
    ).expect(409);
    await submit(submission).expect(409);
    const consumed = await request('owner').get(path).expect(200);
    expect(consumed.body.data.status).toBe('CONSUMED');

    const { outputId, revisionId } = original.body.data;
    const files = await request('owner')
      .get(`/outputs/${outputId}/files`)
      .expect(200);
    expect(files.body.data).toMatchObject([
      { visibility: 'PRIVATE', isCurrentReleaseAttachment: true },
    ]);
    const file = files.body.data[0];
    const { rows } = await db.query(
      'SELECT revision_id FROM output_revision_files WHERE file_id = $1',
      [file.id],
    );
    expect(rows).toEqual([{ revision_id: revisionId }]);
    await db.query(
      `UPDATE article_creation_uploads
       SET created_at = now() - interval '2 days', verified_at = now() - interval '36 hours',
           consumed_at = now() - interval '30 hours', expires_at = now() - interval '1 day'
       WHERE id = $1`,
      [upload.uploadId],
    );
    await sweepExpiredUploads();
    await detail(outputId).expect(200);
    await request('reader')
      .get(`/output-files/${file.id}/download`)
      .expect(403);
    const download = await request('owner')
      .get(`/output-files/${file.id}/download`)
      .expect(200);
    expect(download.body).toEqual(pdf);
  });

  it('rejects mismatching storage bytes and cleans an expired upload', async () => {
    const incompatibleObjects = [
      { bytes: pdf, contentType: 'text/plain' },
      { bytes: pdf.subarray(0, -1), contentType: pdfInput.mimeType },
      {
        bytes: Buffer.from(pdf.toString().replace('Catalog', 'Changed')),
        contentType: pdfInput.mimeType,
      },
    ];
    for (const object of incompatibleObjects) {
      const upload = await preparePdf();
      await storage.putObject(upload.key, object.bytes, object.contentType);
      await request('owner')
        .post(`${uploadEndpoint}/${upload.uploadId}/confirm`)
        .expect(409);
    }

    const fakePdf = Buffer.from(pdf.toString().replace('%PDF-', 'TEXT-'));
    const invalid = await preparePdf({
      ...pdfInput,
      sha256: createHash('sha256').update(fakePdf).digest('hex'),
    });
    await storage.putObject(invalid.key, fakePdf, pdfInput.mimeType);
    await request('owner')
      .post(`${uploadEndpoint}/${invalid.uploadId}/confirm`)
      .expect(409);

    const expired = await verifiedPdf();
    await db.query(
      `UPDATE article_creation_uploads
       SET created_at = now() - interval '2 days', verified_at = now() - interval '1 day',
           expires_at = now() - interval '10 minutes'
       WHERE id = $1`,
      [expired.uploadId],
    );
    const path = `${uploadEndpoint}/${expired.uploadId}`;
    const status = await request('owner').get(path).expect(200);
    expect(status.body.data.status).toBe('EXPIRED');
    await request('owner').post(`${path}/confirm`).expect(410);
    await submit({
      ...input,
      uploadId: expired.uploadId,
      fileVisibility: 'PRIVATE',
    }).expect(410);
    const deletion = vi
      .spyOn(storage, 'deleteObject')
      .mockRejectedValueOnce(new Error('temporary storage failure'));
    try {
      await sweepExpiredUploads();
      expect(await storage.headObject(expired.key)).not.toBeNull();
    } finally {
      deletion.mockRestore();
    }
    await sweepExpiredUploads();
    expect(await storage.headObject(expired.key)).toBeNull();
    await sweepExpiredUploads();
  });

  it('allows just one submission to consume an upload across different idempotency keys', async () => {
    const { uploadId } = await verifiedPdf();
    const submission = { ...input, uploadId, fileVisibility: 'FPTU_COMMUNITY' };
    const attempts = await Promise.all([
      submit(submission),
      submit(submission),
    ]);
    expect(attempts.map(({ status }) => status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const winner = attempts.find(({ status }) => status === 201)!;
    const files = await request('reader')
      .get(`/outputs/${winner.body.data.outputId}/files`)
      .expect(200);
    expect(files.body.data).toMatchObject([
      { visibility: 'FPTU_COMMUNITY', isCurrentReleaseAttachment: true },
    ]);
    const { rows } = await db.query(
      `SELECT count(*)::int AS file_count FROM output_files f
       JOIN article_creation_uploads u ON u.storage_key = f.storage_key WHERE u.id = $1`,
      [uploadId],
    );
    expect(rows[0].file_count).toBe(1);
  });

  it('rolls back upload consumption if releasing the attached revision fails', async () => {
    const upload = await verifiedPdf();
    await db.query(`
      CREATE FUNCTION reject_upload_test_release() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.title = 'Article attachment rollback fixture' AND NEW.released_at IS NOT NULL THEN
          RAISE EXCEPTION 'test release failure' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_upload_test_release BEFORE UPDATE ON output_revisions
        FOR EACH ROW EXECUTE FUNCTION reject_upload_test_release();
    `);
    const key = randomUUID();
    const submission = {
      ...input,
      title: 'Article attachment rollback fixture',
      uploadId: upload.uploadId,
      fileVisibility: 'PRIVATE',
    };
    try {
      const failed = await submit(submission, key);
      expect(failed.status).toBeGreaterThanOrEqual(400);
      const { rows } = await db.query(
        `SELECT f.id, u.consumed_at FROM article_creation_uploads u
         LEFT JOIN output_files f ON f.storage_key = u.storage_key WHERE u.id = $1`,
        [upload.uploadId],
      );
      expect(rows).toEqual([{ id: null, consumed_at: null }]);
    } finally {
      await db.query(`
        DROP TRIGGER reject_upload_test_release ON output_revisions;
        DROP FUNCTION reject_upload_test_release();
      `);
    }
    await submit(submission, key).expect(201);
  });

  it('only rewrites author rows whose name or byline position changed', async () => {
    const { body } = await submit({
      ...input,
      authors: [
        { displayName: 'An' },
        { displayName: 'Binh' },
        { displayName: 'Chi' },
      ],
    }).expect(201);
    const { outputId, revisionId } = body.data;
    const article = (await detail(outputId).expect(200)).body.data;
    const readByline = async () =>
      (
        await db.query(
          `SELECT id, author_name_string AS name, ctid::text AS row_version
           FROM output_authors WHERE output_id = $1 ORDER BY author_order`,
          [outputId],
        )
      ).rows;
    const before = await readByline();
    const authors = article.authors.map((author, index) => ({
      authorId: author.id,
      displayName: index === 1 ? 'Bình' : author.authorNameString,
    }));
    const path = `/outputs/${outputId}/article`;
    const renamed = await request('owner')
      .patch(path)
      .send({ expectedRevisionId: revisionId, authors })
      .expect(200);
    const afterRename = await readByline();
    expect(afterRename[0]).toEqual(before[0]);
    expect(afterRename[1]).toMatchObject({ id: before[1].id, name: 'Bình' });
    expect(afterRename[1].row_version).not.toBe(before[1].row_version);
    expect(afterRename[2]).toEqual(before[2]);

    await request('owner')
      .patch(path)
      .send({
        expectedRevisionId: renamed.body.data.currentReleaseId,
        authors: [...authors].reverse(),
      })
      .expect(200);
    const afterReorder = await readByline();
    expect(afterReorder.map(({ id }) => id)).toEqual(
      [...before].reverse().map(({ id }) => id),
    );
    expect(afterReorder[1]).toEqual(afterRename[1]);
  });

  it('edits a released Article while preserving author claims, private files and the previous release', async () => {
    const upload = await verifiedPdf();
    const { body } = await submit({
      ...input,
      authors: [
        { displayName: 'Owner' },
        { displayName: 'Co-author', userId: actors.researcher },
      ],
      topicIds: [activeTopic],
      uploadId: upload.uploadId,
      fileVisibility: 'PRIVATE',
    }).expect(201);
    const { outputId, revisionId } = body.data;
    const path = `/outputs/${outputId}/article`;
    const original = (await detail(outputId).expect(200)).body.data;
    const filesPath = `/outputs/${outputId}/files`;
    const file = (await request('owner').get(filesPath).expect(200)).body
      .data[0];
    const [owner, coauthor] = original.authors;
    await db.query(
      `INSERT INTO publication_claims (output_id, user_id, author_id, match_source)
       VALUES ($1, $2, $3, 'TEST')`,
      [outputId, actors.researcher, coauthor.id],
    );
    const change = {
      expectedRevisionId: revisionId,
      title: 'Revised Article',
      publicationDate: '2025-11',
      doi: 'https://doi.org/10.1234/REVISED-ARTICLE',
      abstract: 'Updated summary',
      journal: 'Updated journal',
      volume: '10',
      issue: '4',
      pages: '1–9',
      peerReviewed: false,
      topicIds: [secondTopic],
      authors: [
        {
          authorId: coauthor.id,
          displayName: coauthor.authorNameString,
          userId: actors.researcher,
        },
        { displayName: 'New author' },
        { authorId: owner.id, displayName: owner.authorNameString },
      ],
    };
    await request('researcher').patch(path).send(change).expect(403);
    await request('owner')
      .patch(path)
      .send({ expectedRevisionId: revisionId, title: null })
      .expect(400);
    await request('owner')
      .patch(path)
      .send({ ...change, topicIds: [inactiveTopic] })
      .expect(400);
    const blocked = await request('owner')
      .patch(path)
      .send({ ...change, authors: change.authors.slice(1) })
      .expect(409);
    expect(blocked.body.message).toBe('output_author_claimed');
    const takenDoi = '10.1234/taken-edit-doi';
    await submit({ ...input, doi: takenDoi }).expect(201);
    const duplicate = await request('owner')
      .patch(path)
      .send({ ...change, doi: takenDoi })
      .expect(409);
    expect(duplicate.body.message).toBe('output_doi_conflict');
    const unchanged = await request('owner')
      .patch(path)
      .send({ expectedRevisionId: revisionId })
      .expect(200);
    expect(unchanged.body.data.currentReleaseId).toBe(revisionId);
    expect(
      unchanged.body.data.authors.map(({ id }: { id: string }) => id),
    ).toEqual([owner.id, coauthor.id]);
    const saved = (await request('owner').patch(path).send(change).expect(200))
      .body.data;
    await request('owner').patch(path).send(change).expect(409);
    const reloaded = (await detail(outputId).expect(200)).body.data;
    expect(reloaded).toMatchObject({
      id: outputId,
      currentReleaseId: saved.currentReleaseId,
      firstSharedAt: original.firstSharedAt,
      doi: '10.1234/revised-article',
      currentRevision: {
        title: change.title,
        publicationDate: '2025-11',
        publicationYear: 2025,
        abstract: change.abstract,
        venue: change.journal,
        volume: change.volume,
        issue: change.issue,
        pages: change.pages,
        peerReviewed: false,
      },
      authors: [
        { id: coauthor.id, userId: actors.researcher },
        { authorNameString: 'New author' },
        { id: owner.id },
      ],
      topics: [{ topicId: secondTopic }],
    });
    expect(saved.currentReleaseId).not.toBe(revisionId);
    const before = await db.query(
      'SELECT title, authors_snapshot FROM output_revisions WHERE id = $1',
      [revisionId],
    );
    expect(before.rows[0].title).toBe(input.title);
    expect(
      before.rows[0].authors_snapshot.map(({ id }: { id: string }) => id),
    ).toEqual([owner.id, coauthor.id]);
    const claims = await db.query(
      'SELECT author_id FROM publication_claims WHERE output_id = $1',
      [outputId],
    );
    expect(claims.rows).toEqual([{ author_id: coauthor.id }]);
    expect(
      (await request('owner').get(filesPath).expect(200)).body.data,
    ).toEqual([file]);
    expect(
      (await request('reader').get(filesPath).expect(200)).body.data,
    ).toEqual([]);
    const cleared = (
      await request('owner')
        .patch(path)
        .send({
          expectedRevisionId: saved.currentReleaseId,
          doi: null,
          abstract: null,
          topicIds: [],
        })
        .expect(200)
    ).body.data;
    expect(cleared).toMatchObject({
      doi: null,
      topics: [],
      currentRevision: {
        abstract: null,
        title: change.title,
        publicationDate: '2025-11',
      },
    });
  });

  it('adds an abstract to a released Article without changing the previous revision or file access', async () => {
    const upload = await verifiedPdf();
    const created = await submit({
      ...input,
      topicIds: [activeTopic],
      uploadId: upload.uploadId,
      fileVisibility: 'PRIVATE',
    }).expect(201);
    const { outputId, revisionId } = created.body.data;
    const path = `/outputs/${outputId}/article-abstract`;
    const original = (await detail(outputId).expect(200)).body.data;
    const filesPath = `/outputs/${outputId}/files`;
    const ownerFiles = (await request('owner').get(filesPath).expect(200)).body
      .data;
    expect(ownerFiles).toHaveLength(1);
    const change = {
      expectedRevisionId: revisionId,
      abstract: '  New abstract.  ',
    };

    await request('researcher').patch(path).send(change).expect(403);
    await request('owner')
      .patch(path)
      .send({ ...change, abstract: '   ' })
      .expect(400);
    const saved = await request('owner').patch(path).send(change).expect(200);
    const nextId = saved.body.data.id;
    expect(nextId).not.toBe(revisionId);
    await request('owner').patch(path).send(change).expect(409);
    const replay = await request('owner')
      .patch(path)
      .send({ ...change, expectedRevisionId: nextId })
      .expect(200);
    expect(replay.body.data.id).toBe(nextId);

    const reloaded = (await detail(outputId).expect(200)).body.data;
    expect(reloaded).toMatchObject({
      currentReleaseId: nextId,
      firstSharedAt: original.firstSharedAt,
      audience: original.audience,
      authors: original.authors,
      topics: original.topics,
      currentRevision: {
        title: original.currentRevision.title,
        abstract: 'New abstract.',
      },
    });
    expect(
      (await request('owner').get(filesPath).expect(200)).body.data,
    ).toEqual(ownerFiles);
    expect(
      (await request('reader').get(filesPath).expect(200)).body.data,
    ).toEqual([]);
    const old = await db.query(
      'SELECT abstract FROM output_revisions WHERE id = $1',
      [revisionId],
    );
    expect(old.rows).toEqual([{ abstract: original.currentRevision.abstract }]);
  });

  it('lets the owner manage an Article PDF and withdraws replaced files from group-pinned revisions', async () => {
    const created = await submit({ ...input, topicIds: [activeTopic] }).expect(
      201,
    );
    const { outputId, revisionId } = created.body.data;
    const pdfPath = `/outputs/${outputId}/article-pdf`;
    const firstSharedAt = async () => {
      const { rows } = await db.query(
        'SELECT first_shared_at::text FROM research_outputs WHERE id = $1',
        [outputId],
      );
      return rows[0].first_shared_at;
    };
    const firstReleaseTime = await firstSharedAt();
    const upload = await verifiedPdf();
    const attachment = {
      uploadId: upload.uploadId,
      fileVisibility: 'PRIVATE',
      expectedRevisionId: revisionId,
    };
    await request('researcher').put(pdfPath).send(attachment).expect(403);
    const added = await request('owner')
      .put(pdfPath)
      .send(attachment)
      .expect(200);
    const oldFile = added.body.data.fileId;
    const oldRevision = added.body.data.revisionId;
    expect(oldRevision).not.toBe(revisionId);

    const publicFile = { fileVisibility: 'FPTU_COMMUNITY' };
    await request('researcher')
      .patch(`${pdfPath}/${oldFile}`)
      .send(publicFile)
      .expect(403);
    const changed = await request('owner')
      .patch(`${pdfPath}/${oldFile}`)
      .send(publicFile)
      .expect(200);
    expect(changed.body.data.visibility).toBe('FPTU_COMMUNITY');
    await request('reader')
      .get(`/output-files/${oldFile}/download`)
      .expect(200);
    await request('owner')
      .patch(`${pdfPath}/${oldFile}`)
      .send({ fileVisibility: 'PRIVATE' })
      .expect(200);
    await request('reader')
      .get(`/output-files/${oldFile}/download`)
      .expect(403);
    await request('owner').get(`/output-files/${oldFile}/download`).expect(200);
    await request('owner')
      .patch(`${pdfPath}/${oldFile}`)
      .send(publicFile)
      .expect(200);

    const groupId = randomUUID();
    await db.query(
      'INSERT INTO research_groups (id, code, name, lead_id) VALUES ($1, $2, $3, $4)',
      [groupId, 'article-pdf-pin', 'Article PDF group', actors.owner],
    );
    await db.query(
      `INSERT INTO group_output_links (
         output_id, group_id, requested_revision_id, requested_by, status,
         decided_by, decided_at, accepted_revision_id, accepted_by, accepted_at
       ) VALUES ($1, $2, $3, $4, 'ACCEPTED', $4, now(), $3, $4, now())`,
      [outputId, groupId, oldRevision, actors.owner],
    );

    const replacement = await verifiedPdf();
    const replacementInput = {
      uploadId: replacement.uploadId,
      fileVisibility: 'FPTU_COMMUNITY',
      expectedRevisionId: oldRevision,
      replaceFileId: oldFile,
    };
    await request('owner')
      .put(pdfPath)
      .send({ ...replacementInput, expectedRevisionId: revisionId })
      .expect(409);
    const unverified = await preparePdf();
    await request('owner')
      .put(pdfPath)
      .send({ ...replacementInput, uploadId: unverified.uploadId })
      .expect(409);
    await request('reader')
      .get(`/output-files/${oldFile}/download`)
      .expect(200);
    const replaced = await request('owner')
      .put(pdfPath)
      .send(replacementInput)
      .expect(200);
    const newFile = replaced.body.data.fileId;
    expect(newFile).not.toBe(oldFile);
    await request('reader')
      .get(`/output-files/${newFile}/download`)
      .expect(200);
    await request('reader')
      .get(`/output-files/${oldFile}/download`)
      .expect(403);
    await request('owner').get(`/output-files/${oldFile}/download`).expect(403);
    const history = await db.query(
      `SELECT pin.accepted_revision_id, f.is_available
       FROM group_output_links pin
       JOIN output_revision_files rf ON rf.revision_id = pin.accepted_revision_id
       JOIN output_files f ON f.id = rf.file_id
       WHERE pin.group_id = $1 AND f.id = $2`,
      [groupId, oldFile],
    );
    expect(history.rows).toEqual([
      { accepted_revision_id: oldRevision, is_available: false },
    ]);

    const removed = await request('owner')
      .delete(`${pdfPath}/${newFile}`)
      .expect(200);
    expect(removed.body.data.revisionId).not.toBe(
      replaced.body.data.revisionId,
    );
    await request('reader')
      .get(`/output-files/${newFile}/download`)
      .expect(403);
    const files = await request('owner')
      .get(`/outputs/${outputId}/files`)
      .expect(200);
    expect(files.body.data).toEqual([]);
    expect(await firstSharedAt()).toBe(firstReleaseTime);
    const topics = await db.query(
      'SELECT topic_id FROM output_topics WHERE revision_id = $1',
      [removed.body.data.revisionId],
    );
    expect(topics.rows).toEqual([{ topic_id: activeTopic }]);
  });

  it('migrates released and draft PAPER revisions and preserves the release lock and other types', async () => {
    expect(await readLegacyRevision()).toEqual({
      ...originalRevision,
      output_type: 'ARTICLE',
    });
    const revised = await db.query(
      'SELECT output_type FROM output_revisions WHERE id = $1',
      [aliasRevision],
    );
    expect(revised.rows[0].output_type).toBe('ARTICLE');
    const dataset = await db.query(
      'SELECT output_type FROM output_revisions WHERE id = $1',
      [datasetRevision],
    );
    expect(dataset.rows[0].output_type).toBe('DATASET');
    await expect(
      db.query("UPDATE output_revisions SET title = 'Mutation' WHERE id = $1", [
        legacyRevision,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    const response = await detail(legacyOutput).expect(200);
    expect(response.body.data.currentRevision).toMatchObject({
      id: legacyRevision,
      publicationDate: '2020',
      publicationYear: 2020,
    });
    expect(response.body.data.authors).toMatchObject([
      {
        id: expect.any(String),
        authorNameString: 'Legacy author',
        userId: actors.owner,
        isCorrespondingAuthor: true,
      },
      {
        authorNameString: 'Outside author',
        userId: null,
        isCorrespondingAuthor: false,
      },
      {
        authorNameString: 'Older display name',
        userId: null,
        isCorrespondingAuthor: false,
      },
      {
        authorNameString: 'Explicitly unlinked',
        userId: null,
        isCorrespondingAuthor: false,
      },
    ]);
  });

  it('preserves the Discovery timestamp when migrating a shared PAPER revision', async () => {
    expect(await readLegacySearchTimestamp()).toBe(originalSearchTimestamp);
  });

  it('releases a metadata-only Article for immediate community access without implicitly linking the owner as author', async () => {
    const created = await submit(input).expect(201);
    const { outputId, revisionId } = created.body.data;
    const fingerprint = await db.query(
      'SELECT create_request_hash FROM research_outputs WHERE id = $1',
      [outputId],
    );
    // Existing RES-172 idempotency records use the metadata-only fingerprint.
    expect(fingerprint.rows[0].create_request_hash).toBe(
      'ad06951e4788320eab89a31dc489c8e99ae07b29daa81c23fc498489a7c1d28c',
    );
    const response = await detail(outputId).expect(200);
    expect(response.body.data).toMatchObject({
      ownerId: actors.owner,
      scopeType: 'PERSONAL',
      audience: 'FPTU_COMMUNITY',
      sharingStatus: 'SHARED',
      currentReleaseId: revisionId,
      doi: null,
      authors: [{ authorNameString: 'owner', userId: null, authorOrder: 1 }],
      topics: [],
      currentRevision: {
        id: revisionId,
        revisionNo: 1,
        title: input.title,
        outputType: 'ARTICLE',
        publicationDate: '2026',
        publicationYear: 2026,
        abstract: null,
        peerReviewed: null,
        releasedAt: expect.any(String),
      },
    });
    const feed = await http
      .request(app.getHttpServer())
      .get('/outputs/home-feed')
      .set('Cookie', cookies.get('reader')!)
      .expect(200);
    expect(feed.body.data.items).toContainEqual(
      expect.objectContaining({ id: outputId }),
    );
  });

  it('requires an authenticated researcher and a non-empty idempotency key', async () => {
    await http
      .request(app.getHttpServer())
      .post('/outputs')
      .send(input)
      .expect(401);
    await submit(input, 'reader', 'reader').expect(403);
    for (const key of [null, '', 'x'.repeat(201)]) {
      const response = await submit(input, key).expect(400);
      expect(response.body.message).toBe('output_idempotency_key_invalid');
    }
  });

  it('preserves other types on draft edits and rejects the retired PAPER alias', async () => {
    const update = (outputType: string) =>
      http
        .request(app.getHttpServer())
        .patch(`/outputs/${legacyOutput}/revision`)
        .set('Cookie', cookies.get('owner')!)
        .send({ outputType });

    const edited = await update('Dataset').expect(200);
    expect(edited.body.data.outputType).toBe('Dataset');
    await update('PAPER').expect(400);
  });

  it('updates draft dates at the submitted precision and protects them from year-only edits', async () => {
    const update = (body: object) =>
      http
        .request(app.getHttpServer())
        .patch(`/outputs/${legacyOutput}/revision`)
        .set('Cookie', cookies.get('owner')!)
        .send(body);

    const fullDate = await update({ publicationDate: ' 29-02-2024 ' }).expect(
      200,
    );
    expect(fullDate.body.data).toMatchObject({
      id: aliasRevision,
      publicationDate: '2024-02-29',
      publicationYear: 2024,
    });

    const yearOnly = await update({ publicationYear: 2025 }).expect(400);
    expect(yearOnly.body.errors).toContainEqual({
      field: 'publicationDate',
      messages: ['publication_date_required'],
    });
    const mismatch = await update({
      publicationYear: 2025,
      publicationDate: '2024-06',
    }).expect(400);
    expect(mismatch.body.errors).toContainEqual({
      field: 'publicationYear',
      messages: ['publication_year_date_mismatch'],
    });
    for (const publicationDate of ['29-02-2025', 2026, null]) {
      await update({ publicationDate }).expect(400);
    }

    const titleEdit = await update({ title: 'Corrected draft title' }).expect(
      200,
    );
    expect(titleEdit.body.data.publicationDate).toBe('2024-02-29');

    for (const publicationDate of ['2025-02', '2025']) {
      const response = await update({ publicationDate }).expect(200);
      expect(response.body.data).toMatchObject({
        publicationDate,
        publicationYear: 2025,
      });
    }
    expect((await readLegacyRevision()).title).toBe(originalRevision.title);
  });

  it('rejects invalid metadata and unselectable author and Topic IDs', async () => {
    for (const patch of [
      { title: '   ' },
      { publicationDate: undefined },
      { publicationDate: 2026 },
      { publicationDate: '29-02-2023' },
      { publicationDate: '2026-13' },
      { doi: 'not a DOI' },
      { authors: [] },
      { authors: [[{ displayName: 'Nested array' }]] },
      { authors: [{ displayName: 123 }] },
      { authors: [{ displayName: 'Missing account', userId: randomUUID() }] },
      {
        authors: ['One', 'Two'].map((displayName) => ({
          displayName,
          userId: actors.reader,
        })),
      },
      { topicIds: ['invalid'] },
      { topicIds: [randomUUID()] },
      { topicIds: [inactiveTopic] },
      { peerReviewed: 'false' },
      { outputType: 'DATASET' },
      { outputType: 'PAPER' },
      { visibility: 'PRIVATE' },
      { uploadId: randomUUID() },
      { fileVisibility: 'PRIVATE' },
      { uploadId: null, fileVisibility: 'PRIVATE' },
      { uploadId: randomUUID(), fileVisibility: null },
      { uploadId: randomUUID(), fileVisibility: 'RESEARCH_GROUP' },
    ]) {
      const response = await submit({ ...input, ...patch });
      expect(response.status, JSON.stringify(patch)).toBe(400);
    }
  });

  it.each([
    {
      field: 'publicationDate',
      value: '29-02-2023',
      code: 'publication_date_invalid',
    },
    { field: 'doi', value: 'not a DOI', code: 'doi_invalid' },
    {
      field: 'doi',
      value: 'https://doi.org/10.1234/invalid%00',
      code: 'doi_invalid',
    },
  ])(
    'reports invalid $field on the submitted field',
    async ({ field, value, code }) => {
      const response = await submit({ ...input, [field]: value }).expect(400);
      expect(response.body.errors).toContainEqual({ field, messages: [code] });
    },
  );

  it('stores ordered authors, selected Topics, month precision and optional bibliography', async () => {
    const response = await submit({
      ...input,
      outputType: 'ARTICLE',
      authors: [
        { displayName: 'Outside author' },
        { displayName: 'ResearchOS co-author', userId: actors.reader },
      ],
      topicIds: [activeTopic, secondTopic, activeTopic],
      publicationDate: '2026-11',
      journal: 'Journal of Research',
      abstract: 'Article abstract',
      volume: '2',
      issue: 'S1',
      pages: 'e133',
      peerReviewed: false,
    }).expect(201);
    const { outputId } = response.body.data;
    const article = (await detail(outputId).expect(200)).body.data;
    expect(article.authors).toMatchObject([
      { authorNameString: 'Outside author', userId: null, authorOrder: 1 },
      {
        authorNameString: 'ResearchOS co-author',
        userId: actors.reader,
        authorOrder: 2,
      },
    ]);
    expect(
      article.topics.map((topic: { topicId: string }) => topic.topicId).sort(),
    ).toEqual([activeTopic, secondTopic].sort());
    expect(article.currentRevision).toMatchObject({
      outputType: 'ARTICLE',
      publicationDate: '2026-11',
      publicationYear: 2026,
      venue: 'Journal of Research',
      abstract: 'Article abstract',
      volume: '2',
      issue: 'S1',
      pages: 'e133',
      peerReviewed: false,
    });
  });

  it('keeps the released byline when current author names and account links change', async () => {
    const response = await submit({
      ...input,
      authors: [
        { displayName: 'An' },
        { displayName: 'Binh', userId: actors.reader },
      ],
    }).expect(201);
    const { outputId } = response.body.data;
    const original = (await detail(outputId).expect(200)).body.data.authors;

    await db.query(
      `UPDATE output_authors
       SET author_name_string = 'Updated name', user_id = $2
       WHERE output_id = $1 AND author_order = 1`,
      [outputId, actors.researcher],
    );

    const article = (await detail(outputId).expect(200)).body.data;
    expect(article.authors).toEqual(original);
    const feed = await http
      .request(app.getHttpServer())
      .get('/outputs/home-feed')
      .set('Cookie', cookies.get('reader')!)
      .expect(200);
    expect(feed.body.data.items).toContainEqual(
      expect.objectContaining({ id: outputId, authors: original }),
    );
  });

  it('replays a concurrent normalized payload before checking DOI and conflicts on changed metadata', async () => {
    const key = randomUUID();
    const body = {
      ...input,
      doi: 'DOI:10.1234/Replay#Edition',
      publicationDate: '29-02-2024',
      topicIds: [activeTopic, secondTopic],
    };
    const canonical = {
      ...input,
      outputType: 'ARTICLE',
      title: `  ${input.title}  `,
      doi: 'https://doi.org/10.1234/replay%23edition?noredirect',
      publicationDate: '2024-02-29',
      topicIds: [secondTopic, activeTopic],
    };
    const [first, retry] = await Promise.all([
      submit(body, key).expect(201),
      submit(canonical, key).expect(201),
    ]);
    expect(retry.body.data).toEqual(first.body.data);
    const article = (await detail(first.body.data.outputId).expect(200)).body
      .data;
    expect(article.doi).toBe('10.1234/replay#edition');
    expect(article.currentRevision.publicationDate).toBe('2024-02-29');
    const conflict = await submit(
      { ...body, title: 'Changed title' },
      key,
    ).expect(409);
    expect(conflict.body.message).toBe('output_idempotency_key_conflict');
    const duplicate = await submit(canonical).expect(409);
    expect(duplicate.body.message).toBe('output_doi_conflict');
  });

  it('preserves a literal percent escape in the name of a pre-existing manual DOI', async () => {
    expect((await detail(legacyOutput).expect(200)).body.data.doi).toBe(
      literalPercentDoi,
    );
    const duplicate = await submit({
      ...input,
      doi: 'https://doi.org/10.1234/literal%2523doi',
    }).expect(409);
    expect(duplicate.body.message).toBe('output_doi_conflict');
  });

  it('scopes keys to the actor and rejects DOI conflicts even with imported works or concurrent requests', async () => {
    const key = randomUUID();
    const [owner, researcher] = await Promise.all([
      submit(input, key).expect(201),
      submit(input, key, 'researcher').expect(201),
    ]);
    expect(researcher.body.data.outputId).not.toBe(owner.body.data.outputId);

    const existing = await submit({ ...input, doi: importedDoi }).expect(409);
    expect(existing.body.message).toBe('output_doi_conflict');
    const row = await db.query(
      'SELECT doi, owner_id, import_state FROM research_outputs WHERE id = $1',
      [importedOutput],
    );
    expect(row.rows[0]).toEqual({
      doi: importedDoi,
      owner_id: null,
      import_state: 'CANDIDATE',
    });

    const body = { ...input, doi: '10.1234/concurrent' };
    const racing = await Promise.all([
      submit(body),
      submit(body, randomUUID(), 'researcher'),
    ]);
    expect(
      racing.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(
      racing.find((response) => response.status === 409)?.body.message,
    ).toBe('output_doi_conflict');
  });

  it('freezes the published byline and relinks the correct OpenAlex author after reordering', async () => {
    const { OpenAlexIngestService } =
      await import('../dist/modules/openalex/openalex-ingest.service.js');
    const outputId = randomUUID();
    const workId = 'https://openalex.org/W101175';
    await db.query(
      "INSERT INTO research_outputs (id, created_by, import_state) VALUES ($1, $2, 'CANDIDATE')",
      [outputId, actors.researcher],
    );
    await db.query(
      `INSERT INTO output_revisions
         (output_id, revision_no, title, output_type, created_by, authors_snapshot)
       VALUES ($1, 1, 'Imported Article', 'ARTICLE', $2, $3::jsonb)`,
      [
        outputId,
        actors.researcher,
        JSON.stringify([
          {
            name: 'Imported author',
            order: 1,
            orcid: importedOrcid,
            isCorresponding: true,
          },
          { name: 'Other author', order: 2 },
        ]),
      ],
    );
    await db.query(
      `INSERT INTO output_authors (output_id, author_name_string, author_order, is_corresponding_author)
       VALUES ($1, 'Imported author', 1, true), ($1, 'Other author', 2, false)`,
      [outputId],
    );
    await db.query(
      "INSERT INTO output_external_ids (output_id, source, external_id) VALUES ($1, 'OPENALEX', $2)",
      [outputId, workId],
    );
    const server = app.getHttpServer();
    const cookie = cookies.get('researcher')!;
    await http
      .request(server)
      .post(`/external/openalex/works/${outputId}/accept`)
      .set('Cookie', cookie)
      .expect(200);
    await http
      .request(server)
      .post(`/outputs/${outputId}/publish`)
      .set('Cookie', cookie)
      .send({ audience: 'FPTU_COMMUNITY' })
      .expect(200);

    const article = (await detail(outputId).expect(200)).body.data;
    expect(article.authors).toMatchObject([
      {
        authorNameString: 'Imported author',
        userId: actors.researcher,
        isCorrespondingAuthor: true,
      },
      { authorNameString: 'Other author', userId: null },
    ]);
    await db.query(
      'UPDATE output_authors SET user_id = NULL WHERE output_id = $1',
      [outputId],
    );
    expect((await detail(outputId).expect(200)).body.data.authors).toEqual(
      article.authors,
    );

    await request('researcher')
      .patch(`/outputs/${outputId}/article`)
      .send({
        expectedRevisionId: article.currentReleaseId,
        authors: [...article.authors].reverse().map((author) => ({
          authorId: author.id,
          displayName: author.authorNameString,
        })),
      })
      .expect(200);
    const ingest = await app
      .get(OpenAlexIngestService)
      .upsertWork(actors.researcher, {
        id: workId,
        shortId: 'W101175',
        doi: null,
        title: 'Imported Article',
        abstract: null,
        venue: null,
        publicationYear: null,
        rawType: 'article',
        outputType: 'ARTICLE',
        url: null,
        authors: [
          {
            order: 1,
            name: 'Imported author',
            isCorresponding: true,
            authorId: 'https://openalex.org/A101',
            orcid: importedOrcid,
          },
          {
            order: 2,
            name: 'Other author',
            isCorresponding: false,
            authorId: 'https://openalex.org/A102',
            orcid: null,
          },
        ],
      });
    expect(ingest.authorOrder).toBe(2);
    const byline = await db.query(
      'SELECT author_name_string, user_id FROM output_authors WHERE output_id = $1 ORDER BY author_order',
      [outputId],
    );
    expect(byline.rows).toEqual([
      { author_name_string: 'Other author', user_id: null },
      { author_name_string: 'Imported author', user_id: actors.researcher },
    ]);
  });

  it('rolls back the Article and retry record when pinning the released revision fails', async () => {
    await db.query(`
      CREATE FUNCTION fail_article_pin() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.doi = '10.1234/rollback' AND NEW.current_release_id IS NOT NULL THEN
          RAISE EXCEPTION 'Forced pin failure for this fixture';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER fail_article_pin BEFORE UPDATE ON research_outputs
        FOR EACH ROW EXECUTE FUNCTION fail_article_pin();
    `);
    const key = randomUUID();
    const body = { ...input, doi: '10.1234/rollback', topicIds: [activeTopic] };
    try {
      await submit(body, key).expect(500);
      const rows = await db.query(
        'SELECT id FROM research_outputs WHERE doi = $1 OR create_idempotency_key = $2',
        [body.doi, key],
      );
      expect(rows.rows).toEqual([]);
    } finally {
      await db.query(
        'DROP TRIGGER fail_article_pin ON research_outputs; DROP FUNCTION fail_article_pin()',
      );
    }
    await submit(body, key).expect(201);
  });

  describe('Private file access (RES-176)', () => {
    const fileAccessCodes = {
      self: 'file_access_self_request',
      granted: 'file_access_already_granted',
      notPending: 'file_access_request_not_pending',
      denied: 'file_access_decision_denied',
      requestMissing: 'file_access_request_not_found',
      grantMissing: 'file_access_grant_not_found',
      notRequestable: 'file_access_not_requestable',
    };

    /** A shared Article whose current release carries one Private PDF. */
    async function privateArticle() {
      const created = await submit(input).expect(201);
      const { outputId, revisionId } = created.body.data;
      const upload = await verifiedPdf();
      const attached = await request('owner')
        .put(`/outputs/${outputId}/article-pdf`)
        .send({
          uploadId: upload.uploadId,
          fileVisibility: 'PRIVATE',
          expectedRevisionId: revisionId,
        })
        .expect(200);
      return {
        outputId: outputId as string,
        firstRevisionId: revisionId as string,
        revisionId: attached.body.data.revisionId as string,
        fileId: attached.body.data.fileId as string,
      };
    }

    const ask = (fileId: string, actor: Actor = 'reader', body: object = {}) =>
      request(actor).post(`/output-files/${fileId}/access-requests`).send(body);
    const act = (
      actor: Actor,
      requestId: string,
      action: 'approve' | 'decline' | 'withdraw',
      body: object = {},
    ) =>
      request(actor)
        .post(`/file-access-requests/${requestId}/${action}`)
        .send(body);
    const revoke = (actor: Actor, grantId: string) =>
      request(actor).post(`/file-access-grants/${grantId}/revoke`).send({});
    const download = (actor: Actor, fileId: string) =>
      request(actor).get(`/output-files/${fileId}/download`);
    const received = (query: string, actor: Actor) =>
      request(actor)
        .get(`/file-access-requests?box=received${query}`)
        .expect(200);
    const count = async (sql: string, params: unknown[]) =>
      Number((await db.query(sql, params)).rows[0].count);

    /** Runs the worker fan-out for one staged event on real PostgreSQL. */
    async function fanOut(eventKey: string): Promise<string[]> {
      const { PrismaService } = await import('@researchos/database');
      const { fanOutNotification } =
        await import('../../worker/dist/modules/notifications/notification-fanout.js');
      const { rows } = await db.query(
        'SELECT id FROM notification_events WHERE event_key = $1',
        [eventKey],
      );
      expect(rows).toHaveLength(1);
      const prisma = app.get(PrismaService);
      await prisma.$transaction((tx) =>
        fanOutNotification(tx, { eventId: rows[0].id }),
      );
      const delivered = await db.query(
        `SELECT recipient_id, body, content_snapshot::text AS snapshot
         FROM notifications WHERE event_key = $1`,
        [eventKey],
      );
      for (const row of delivered.rows) {
        expect(row.body).not.toContain('secret note');
        expect(row.snapshot).not.toContain('secret note');
      }
      return delivered.rows.map(
        (row: { recipient_id: string }) => row.recipient_id,
      );
    }

    it('lets a reader request, receive and lose access to exactly one Private file', async () => {
      const article = await privateArticle();
      const other = await privateArticle();
      await db.query(
        `INSERT INTO user_follows (follower_id, entity_type, entity_id)
         VALUES ($1, 'RESEARCHER', $2) ON CONFLICT DO NOTHING`,
        [actors.researcher, actors.owner],
      );

      // The reader discovers the file id through the Article detail.
      const before = (await detail(article.outputId).expect(200)).body.data;
      expect(before.hasRestrictedPdf).toBe(true);
      expect(before.requestableFiles).toEqual([
        expect.objectContaining({ id: article.fileId, myRequest: null }),
      ]);
      await download('reader', article.fileId).expect(403);

      await http
        .request(app.getHttpServer())
        .post(`/output-files/${article.fileId}/access-requests`)
        .send({})
        .expect(401);
      const self = await ask(article.fileId, 'owner').expect(400);
      expect(self.body.message).toBe(fileAccessCodes.self);

      const sent = await ask(article.fileId, 'reader', {
        message: 'secret note',
      }).expect(201);
      const requestId: string = sent.body.data.id;
      expect(sent.body.data).toMatchObject({
        status: 'PENDING',
        message: 'secret note',
        requester: { id: actors.reader, fullName: 'reader' },
        owner: { id: actors.owner, fullName: 'owner' },
        grant: null,
      });
      expect(JSON.stringify(sent.body)).not.toContain('@article.test.invalid');
      const again = await ask(article.fileId).expect(201);
      expect(again.body.data.id).toBe(requestId);
      const pendingDetail = (await detail(article.outputId).expect(200)).body
        .data;
      expect(pendingDetail.requestableFiles[0].myRequest).toEqual({
        id: requestId,
        status: 'PENDING',
      });
      expect(await fanOut(`file-access:${requestId}:requested`)).toEqual([
        actors.owner,
      ]);

      // Only the current manager sees and decides it.
      const scope = `&outputId=${article.outputId}`;
      expect((await received(scope, 'owner')).body.data.meta.total).toBe(1);
      expect((await received(scope, 'researcher')).body.data.meta.total).toBe(
        0,
      );
      const mine = await request('reader')
        .get('/file-access-requests?box=sent&status=PENDING&limit=100')
        .expect(200);
      expect(
        mine.body.data.items.map((item: { id: string }) => item.id),
      ).toContain(requestId);
      expect(
        (await act('researcher', requestId, 'approve').expect(404)).body
          .message,
      ).toBe(fileAccessCodes.requestMissing);
      expect(
        (await act('reader', requestId, 'approve').expect(403)).body.message,
      ).toBe(fileAccessCodes.denied);

      const approved = await act('owner', requestId, 'approve', {
        response: 'Granted',
      }).expect(200);
      expect(approved.body.data).toMatchObject({
        status: 'APPROVED',
        response: 'Granted',
        grant: { revokedAt: null },
      });
      const grantId: string = approved.body.data.grant.id;
      const replay = await act('owner', requestId, 'approve').expect(200);
      expect(replay.body.data.grant.id).toBe(grantId);
      expect(
        await count(
          'SELECT count(*) FROM file_access_grants WHERE request_id = $1',
          [requestId],
        ),
      ).toBe(1);
      expect(
        await count(
          "SELECT count(*) FROM audit_logs WHERE action = 'file_access.approved' AND entity_id = $1",
          [requestId],
        ),
      ).toBe(1);
      expect(await fanOut(`file-access:${requestId}:approved`)).toEqual([
        actors.reader,
      ]);

      // Exact file: the verified bytes of this file, never another Article's.
      const bytes = await download('reader', article.fileId)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.compare(bytes.body as Buffer, pdf)).toBe(0);
      await download('reader', other.fileId).expect(403);
      expect(
        (await detail(article.outputId).expect(200)).body.data.requestableFiles,
      ).toEqual([]);
      expect((await ask(article.fileId).expect(409)).body.message).toBe(
        fileAccessCodes.granted,
      );

      // A metadata-only revision keeps the same file and the grant.
      await request('owner')
        .patch(`/outputs/${article.outputId}/article-abstract`)
        .send({ expectedRevisionId: article.revisionId, abstract: 'Updated.' })
        .expect(200);
      await download('reader', article.fileId).expect(200);

      // A requester whose account is deactivated loses the file.
      await db.query('BEGIN');
      try {
        await db.query('UPDATE users SET is_active = false WHERE id = $1', [
          actors.reader,
        ]);
        const { rows } = await db.query(
          'SELECT can_view_output_file($1, $2) AS allowed',
          [actors.reader, article.fileId],
        );
        expect(rows[0].allowed).toBe(false);
      } finally {
        await db.query('ROLLBACK');
      }

      // A grant never opens a revision pinned by a group the reader is not in.
      await db.query('BEGIN');
      try {
        const groupId = randomUUID();
        await db.query(
          'INSERT INTO research_groups (id, code, name, lead_id) VALUES ($1, $2, $3, $4)',
          [
            groupId,
            `fa-${groupId.slice(0, 8)}`,
            'File access pin',
            actors.owner,
          ],
        );
        await db.query(
          `INSERT INTO group_output_links (
             output_id, group_id, requested_revision_id, requested_by, status,
             decided_by, decided_at, accepted_revision_id, accepted_by, accepted_at
           ) VALUES ($1, $2, $3, $4, 'ACCEPTED', $4, now(), $3, $4, now())`,
          [article.outputId, groupId, article.revisionId, actors.owner],
        );
        await db.query(
          'UPDATE research_outputs SET current_release_id = $1 WHERE id = $2',
          [article.firstRevisionId, article.outputId],
        );
        const { rows } = await db.query(
          'SELECT can_view_output_file($1, $3) AS reader, can_view_output_file($2, $3) AS owner',
          [actors.reader, actors.owner, article.fileId],
        );
        expect(rows[0]).toEqual({ reader: false, owner: true });
      } finally {
        await db.query('ROLLBACK');
      }

      // Handover: the new owner manages the grant, the former one does not.
      await db.query(
        'UPDATE research_outputs SET owner_id = $1 WHERE id = $2',
        [actors.researcher, article.outputId],
      );
      try {
        expect((await received(scope, 'owner')).body.data.meta.total).toBe(0);
        expect((await revoke('owner', grantId).expect(404)).body.message).toBe(
          fileAccessCodes.grantMissing,
        );
        expect((await revoke('reader', grantId).expect(403)).body.message).toBe(
          fileAccessCodes.denied,
        );
        await download('reader', article.fileId).expect(200);
        const revoked = await revoke('researcher', grantId).expect(200);
        expect(revoked.body.data.grant.revokedAt).not.toBeNull();
        await revoke('researcher', grantId).expect(200);
      } finally {
        await db.query(
          'UPDATE research_outputs SET owner_id = $1 WHERE id = $2',
          [actors.owner, article.outputId],
        );
      }
      expect(
        await count(
          "SELECT count(*) FROM audit_logs WHERE action = 'file_access.revoked' AND entity_id = $1",
          [grantId],
        ),
      ).toBe(1);
      expect(await fanOut(`file-access-grant:${grantId}:revoked`)).toEqual([
        actors.reader,
      ]);
      await download('reader', article.fileId).expect(403);

      // A revoked grant is never restored; a new request issues a new grant.
      const second = await ask(article.fileId).expect(201);
      expect(second.body.data.id).not.toBe(requestId);
      const regranted = await act(
        'owner',
        second.body.data.id,
        'approve',
      ).expect(200);
      expect(regranted.body.data.grant.id).not.toBe(grantId);
      await download('reader', article.fileId).expect(200);
      const oldReplay = await act('owner', requestId, 'approve').expect(200);
      expect(oldReplay.body.data.grant.revokedAt).not.toBeNull();
    });

    it('declines, withdraws and refuses answered requests', async () => {
      const article = await privateArticle();
      const first: string = (await ask(article.fileId).expect(201)).body.data
        .id;
      const declined = await act('owner', first, 'decline', {
        response: 'Not yet',
      }).expect(200);
      expect(declined.body.data).toMatchObject({
        status: 'DECLINED',
        grant: null,
      });
      await act('owner', first, 'decline').expect(200);
      expect(
        (await act('owner', first, 'approve').expect(409)).body.message,
      ).toBe(fileAccessCodes.notPending);
      expect(
        (await act('reader', first, 'withdraw').expect(409)).body.message,
      ).toBe(fileAccessCodes.notPending);
      expect(await fanOut(`file-access:${first}:declined`)).toEqual([
        actors.reader,
      ]);

      const second: string = (await ask(article.fileId).expect(201)).body.data
        .id;
      expect(second).not.toBe(first);
      await act('owner', second, 'withdraw').expect(404);
      const withdrawn = await act('reader', second, 'withdraw').expect(200);
      expect(withdrawn.body.data.status).toBe('WITHDRAWN');
      await act('reader', second, 'withdraw').expect(200);
      await act('owner', second, 'approve').expect(409);
      expect(
        await count(
          'SELECT count(*) FROM file_access_grants WHERE file_id = $1',
          [article.fileId],
        ),
      ).toBe(0);
    });

    it('cancels pending requests and audits when the file becomes unavailable', async () => {
      const article = await privateArticle();
      const pending: string = (await ask(article.fileId).expect(201)).body.data
        .id;
      await request('owner')
        .delete(`/outputs/${article.outputId}/article-pdf/${article.fileId}`)
        .expect(200);

      const { rows } = await db.query(
        'SELECT status, cancel_reason, decided_by FROM file_access_requests WHERE id = $1',
        [pending],
      );
      expect(rows[0]).toEqual({
        status: 'CANCELLED',
        cancel_reason: 'FILE_UNAVAILABLE',
        decided_by: actors.owner,
      });
      const audit = await db.query(
        "SELECT payload FROM audit_logs WHERE action = 'output_file.unavailable' AND entity_id = $1",
        [article.fileId],
      );
      expect(audit.rows).toEqual([
        {
          payload: {
            outputId: article.outputId,
            cancelledRequestIds: [pending],
            revokedGrantIds: [],
          },
        },
      ]);
      expect(
        (await act('owner', pending, 'approve').expect(409)).body.message,
      ).toBe(fileAccessCodes.notPending);
      expect((await ask(article.fileId).expect(409)).body.message).toBe(
        fileAccessCodes.notRequestable,
      );

      // A file with no requests is still audited once.
      const quiet = await privateArticle();
      await request('owner')
        .delete(`/outputs/${quiet.outputId}/article-pdf/${quiet.fileId}`)
        .expect(200);
      expect(
        await count(
          "SELECT count(*) FROM audit_logs WHERE action = 'output_file.unavailable' AND entity_id = $1",
          [quiet.fileId],
        ),
      ).toBe(1);
    });

    it('ends requests and grants when a file stops being Private', async () => {
      const article = await privateArticle();
      const pdfPath = `/outputs/${article.outputId}/article-pdf/${article.fileId}`;
      const granted: string = (await ask(article.fileId).expect(201)).body.data
        .id;
      const grantId: string = (
        await act('owner', granted, 'approve').expect(200)
      ).body.data.grant.id;
      await request('researcher')
        .post(`/output-files/${article.fileId}/access-requests`)
        .send({})
        .expect(201);
      await download('reader', article.fileId).expect(200);

      await request('owner')
        .patch(pdfPath)
        .send({ fileVisibility: 'FPTU_COMMUNITY' })
        .expect(200);
      const audit = await db.query(
        "SELECT payload FROM audit_logs WHERE action = 'output_file.left_private' AND entity_id = $1",
        [article.fileId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].payload.revokedGrantIds).toEqual([grantId]);
      expect(audit.rows[0].payload.cancelledRequestIds).toHaveLength(1);
      expect(
        await count(
          "SELECT count(*) FROM file_access_requests WHERE file_id = $1 AND status = 'PENDING'",
          [article.fileId],
        ),
      ).toBe(0);

      // Making the file Private again does not bring the old grant back.
      await request('owner')
        .patch(pdfPath)
        .send({ fileVisibility: 'PRIVATE' })
        .expect(200);
      await download('reader', article.fileId).expect(403);
      expect(
        (await act('owner', granted, 'approve').expect(200)).body.data.grant
          .revokedAt,
      ).not.toBeNull();
    });

    it('keeps one request, one grant and one audit under concurrent calls', async () => {
      const article = await privateArticle();
      const submits = await Promise.all([
        ask(article.fileId),
        ask(article.fileId),
        ask(article.fileId),
      ]);
      expect(submits.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(new Set(submits.map((r) => r.body.data.id)).size).toBe(1);
      const requestId: string = submits[0]!.body.data.id;

      const approvals = await Promise.all([
        act('owner', requestId, 'approve'),
        act('owner', requestId, 'approve'),
      ]);
      expect(approvals.map((r) => r.status)).toEqual([200, 200]);
      const grantId: string = approvals[0]!.body.data.grant.id;
      expect(approvals[1]!.body.data.grant.id).toBe(grantId);
      const once: [string, unknown[]][] = [
        [
          'SELECT count(*) FROM file_access_grants WHERE request_id = $1',
          [requestId],
        ],
        [
          "SELECT count(*) FROM audit_logs WHERE action = 'file_access.approved' AND entity_id = $1",
          [requestId],
        ],
        [
          'SELECT count(*) FROM notification_events WHERE event_key = $1',
          [`file-access:${requestId}:approved`],
        ],
      ];
      for (const [sql, params] of once) {
        expect(await count(sql, params)).toBe(1);
      }

      const revokes = await Promise.all([
        revoke('owner', grantId),
        revoke('owner', grantId),
      ]);
      expect(revokes.map((r) => r.status)).toEqual([200, 200]);
      expect(
        await count(
          "SELECT count(*) FROM audit_logs WHERE action = 'file_access.revoked' AND entity_id = $1",
          [grantId],
        ),
      ).toBe(1);

      // Approval racing a withdrawal: exactly one wins.
      const raced: string = (await ask(article.fileId).expect(201)).body.data
        .id;
      const [approve, withdraw] = await Promise.all([
        act('owner', raced, 'approve'),
        act('reader', raced, 'withdraw'),
      ]);
      expect([approve.status, withdraw.status].sort()).toEqual([200, 409]);
      const final = await db.query(
        'SELECT status FROM file_access_requests WHERE id = $1',
        [raced],
      );
      const grants = await count(
        'SELECT count(*) FROM file_access_grants WHERE request_id = $1',
        [raced],
      );
      expect(grants).toBe(final.rows[0].status === 'APPROVED' ? 1 : 0);

      // Approval racing removal of the file never leaves a usable grant.
      const removal = await privateArticle();
      const pending: string = (await ask(removal.fileId).expect(201)).body.data
        .id;
      await Promise.all([
        act('owner', pending, 'approve'),
        request('owner').delete(
          `/outputs/${removal.outputId}/article-pdf/${removal.fileId}`,
        ),
      ]);
      const after = await db.query(
        'SELECT status FROM file_access_requests WHERE id = $1',
        [pending],
      );
      expect(['APPROVED', 'CANCELLED']).toContain(after.rows[0].status);
      await download('reader', removal.fileId).expect(403);
    });

    it('rejects a grant that disagrees with its request', async () => {
      const article = await privateArticle();
      const requestId: string = (await ask(article.fileId).expect(201)).body
        .data.id;
      await expect(
        db.query(
          `INSERT INTO file_access_grants (request_id, file_id, grantee_id, granted_by)
           VALUES ($1, $2, $3, $4)`,
          [requestId, article.fileId, actors.researcher, actors.owner],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          `INSERT INTO file_access_grants (request_id, file_id, grantee_id, granted_by)
           VALUES ($1, $2, $3, $4)`,
          [requestId, article.fileId, actors.reader, actors.owner],
        ),
      ).rejects.toThrow(/approved request/);
      await expect(
        db.query('DELETE FROM file_access_requests WHERE id = $1', [requestId]),
      ).rejects.toThrow(/history/);
    });
  });
});
