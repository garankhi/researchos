import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@researchos/database';
import {
  createS3Storage,
  StorageObjectNotFoundError,
  type StorageAdapter,
} from '@researchos/storage';
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
  const databaseName = `article_creation_${randomUUID().replaceAll('-', '')}`;
  let admin: InstanceType<typeof Client>;
  let db: InstanceType<typeof Client>;
  let databaseCreated = false;
  let app: INestApplication;
  let originalRevision: Record<string, unknown>;
  let originalSearchTimestamp: string;
  let storage: StorageAdapter;
  let sweepExpiredUploads: () => Promise<void>;
  const objectKeys = new Set<string>();
  const useLocalS3 = process.env.ARTICLE_UPLOAD_E2E_STORAGE === 'seaweedfs';

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
    await db.query(
      `UPDATE research_outputs SET current_release_id = $1, sharing_status = 'SHARED',
         first_shared_at = clock_timestamp(), visibility = 'FPTU_COMMUNITY' WHERE id = $2`,
      [legacyRevision, legacyOutput],
    );
    originalRevision = await readLegacyRevision();
    originalSearchTimestamp = await readLegacySearchTimestamp();
  }

  beforeAll(async () => {
    if (!originalDatabaseUrl) {
      throw new Error('DATABASE_URL is required for the Article API tests');
    }
    const source = new URL(originalDatabaseUrl);
    source.pathname = '/postgres';
    source.searchParams.delete('schema');
    const databaseUrl = new URL(source);
    databaseUrl.pathname = `/${databaseName}`;

    admin = new Client({ connectionString: source.href });
    db = new Client({ connectionString: databaseUrl.href });
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
      const endpoint = new URL(process.env.S3_ENDPOINT ?? '');
      if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
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
      await app?.close();
      if (useLocalS3) {
        await Promise.all(
          [...objectKeys].map((key) => storage.deleteObject(key)),
        );
      }
    } finally {
      await db?.end();
      try {
        if (databaseCreated) {
          await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        }
      } finally {
        await admin?.end();
        if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

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

  async function putPdf(upload: Awaited<ReturnType<typeof preparePdf>>) {
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
        body: pdf,
      });
      if (!response.ok) {
        throw new Error(`SeaweedFS presigned PUT failed (${response.status})`);
      }
      return;
    }
    await storage.putObject(upload.key, pdf, pdfInput.mimeType);
  }

  async function verifiedPdf() {
    const upload = await preparePdf();
    await putPdf(upload);
    await request('owner')
      .post(`${uploadEndpoint}/${upload.uploadId}/confirm`)
      .expect(200);
    return upload;
  }

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
      visibility: 'FPTU_COMMUNITY',
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

  it('freezes the verified author link when an OpenAlex Article is accepted and published', async () => {
    const outputId = randomUUID();
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
        ]),
      ],
    );
    await db.query(
      `INSERT INTO output_authors (output_id, author_name_string, author_order, is_corresponding_author)
       VALUES ($1, 'Imported author', 1, true)`,
      [outputId],
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
      .send({ visibility: 'FPTU_COMMUNITY' })
      .expect(200);

    const article = (await detail(outputId).expect(200)).body.data;
    expect(article.authors).toMatchObject([
      {
        authorNameString: 'Imported author',
        userId: actors.researcher,
        isCorrespondingAuthor: true,
      },
    ]);
    await db.query(
      'UPDATE output_authors SET user_id = NULL WHERE output_id = $1',
      [outputId],
    );
    expect((await detail(outputId).expect(200)).body.data.authors).toEqual(
      article.authors,
    );
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
});
