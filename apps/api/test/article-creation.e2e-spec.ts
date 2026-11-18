import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@researchos/database';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpTestClient } from './http-test-client.js';

const { Client } = createRequire(import.meta.resolve('@researchos/database'))(
  'pg',
);
const migrationRoot = new URL(
  '../../../packages/database/prisma/migrations/',
  import.meta.url,
);
const articleMigration = '20261118150000_article_creation';

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
  const importedDoi = '10.1234/openalex-candidate';
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

  async function readLegacyRevision() {
    const result = await db.query(
      `SELECT title, output_type, released_at::text, updated_at::text
       FROM output_revisions WHERE id = $1`,
      [legacyRevision],
    );
    return result.rows[0];
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
      `INSERT INTO research_outputs (id, owner_id, created_by, doi, import_state)
       VALUES ($1, $3, $3, NULL, 'NONE'), ($2, NULL, $3, $4, 'CANDIDATE')`,
      [legacyOutput, importedOutput, actors.owner, importedDoi],
    );
    await db.query(
      `INSERT INTO output_revisions
         (id, output_id, revision_no, title, output_type, publication_year,
          created_by, released_by, released_at, authors_snapshot)
       VALUES ($1, $4, 1, 'Legacy paper', 'PAPER', 2020, $6, $6, clock_timestamp(),
               '[{"name":"Legacy author","order":1}]'),
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
      `UPDATE research_outputs SET current_release_id = $1, sharing_status = 'SHARED',
         first_shared_at = clock_timestamp(), visibility = 'FPTU_COMMUNITY' WHERE id = $2`,
      [legacyRevision, legacyOutput],
    );
    originalRevision = await readLegacyRevision();
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
    const { HttpExceptionFilter } =
      await import('../dist/common/filters/http-exception.filter.js');
    const { ApiResponseInterceptor } =
      await import('../dist/common/interceptors/api-response.interceptor.js');
    const fixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThrottlerModule.forRoot([
          { name: 'default', ttl: 60_000, limit: 1_000 },
        ]),
        PrismaModule,
        IdentityModule,
        OutputsModule,
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
      await db?.end();
      if (databaseCreated)
        await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin?.end();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
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
        userId: null,
      },
    ]);
  });

  it('releases a metadata-only Article for immediate community access without implicitly linking the owner as author', async () => {
    const created = await submit(input).expect(201);
    const { outputId, revisionId } = created.body.data;
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
      { uploadId: randomUUID(), fileVisibility: 'PRIVATE' },
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
      doi: 'DOI:10.1234/Replay',
      publicationDate: '29-02-2024',
      topicIds: [activeTopic, secondTopic],
    };
    const canonical = {
      ...input,
      outputType: 'ARTICLE',
      title: `  ${input.title}  `,
      doi: 'https://doi.org/10.1234/replay',
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
    expect(article.doi).toBe('10.1234/replay');
    expect(article.currentRevision.publicationDate).toBe('2024-02-29');
    const conflict = await submit(
      { ...body, title: 'Changed title' },
      key,
    ).expect(409);
    expect(conflict.body.message).toBe('output_idempotency_key_conflict');
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
      'SELECT owner_id, import_state FROM research_outputs WHERE id = $1',
      [importedOutput],
    );
    expect(row.rows[0]).toEqual({ owner_id: null, import_state: 'CANDIDATE' });

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
