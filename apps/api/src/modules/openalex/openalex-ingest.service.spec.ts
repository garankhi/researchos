import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '@researchos/database';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { ProvenanceService } from '../provenance/provenance.service.js';
import {
  OPENALEX_SOURCE,
  OpenAlexIngestService,
} from './openalex-ingest.service.js';
import { OpenAlexClient } from './openalex.client.js';
import type { OpenAlexWork } from './openalex.types.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OUTPUT_ID = '11111111-1111-4111-8111-111111111111';

function makeWork(
  shortId: string,
  overrides: Partial<OpenAlexWork> = {},
): OpenAlexWork {
  return {
    id: `https://openalex.org/${shortId}`,
    shortId,
    doi: null,
    title: `Title ${shortId}`,
    abstract: 'An abstract',
    venue: 'A venue',
    publicationYear: 2020,
    rawType: 'article',
    outputType: 'PAPER',
    url: 'https://example.org/work',
    authors: [
      {
        order: 1,
        name: 'Nguyen Van An',
        isCorresponding: true,
        authorId: 'https://openalex.org/A1',
        orcid: 'https://orcid.org/0000-0002-1825-0097',
      },
      {
        order: 2,
        name: 'Tran Thi B',
        isCorresponding: false,
        authorId: 'https://openalex.org/A2',
        orcid: null,
      },
    ],
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    output_external_ids: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
    },
    research_outputs: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: OUTPUT_ID })),
    },
    researcher_profiles: {
      findUnique: vi.fn(async () => ({ orcid_id: '0000-0002-1825-0097' })),
    },
    output_revisions: {
      create: vi.fn(async () => ({ id: 'rev-1' })),
    },
    output_authors: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    publication_claims: {
      upsert: vi.fn(async () => ({})),
    },
    ...overrides,
  };
}

function makeService(tx: ReturnType<typeof makeTx>) {
  const prisma = {
    $transaction: vi.fn(async (run: (client: unknown) => unknown) => run(tx)),
  } as unknown as PrismaService;
  const client = { getWork: vi.fn() } as unknown as OpenAlexClient;
  const provenance = {
    recordProvenance: vi.fn(async () => undefined),
  } as unknown as ProvenanceService;
  const service = new OpenAlexIngestService(prisma, client, provenance);
  return { service, prisma, client, provenance, tx };
}

describe('OpenAlexIngestService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a candidate: DRAFT/PRIVATE/CANDIDATE, revision 1, external id', async () => {
    const tx = makeTx();
    const { service, provenance } = makeService(tx);

    const result = await service.upsertWork(USER_ID, makeWork('W1'));

    expect(result).toMatchObject({ outputId: OUTPUT_ID, created: true });
    const create = tx.research_outputs.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data).toMatchObject({
      owner_id: null,
      created_by: USER_ID,
      sharing_status: 'DRAFT',
      visibility: 'PRIVATE',
      access_group_id: null,
      current_release_id: null,
      import_state: 'CANDIDATE',
    });
    const revision = tx.output_revisions.create as ReturnType<typeof vi.fn>;
    expect(revision.mock.calls[0][0].data).toMatchObject({
      output_id: OUTPUT_ID,
      revision_no: 1,
      publisher: null,
      created_by: USER_ID,
    });
    const external = tx.output_external_ids.create as ReturnType<typeof vi.fn>;
    expect(external.mock.calls[0][0].data).toMatchObject({
      output_id: OUTPUT_ID,
      source: OPENALEX_SOURCE,
      external_id: 'https://openalex.org/W1',
    });
    // Title/abstract/authors/venue/year/doi all get a provenance row.
    expect(
      (provenance.recordProvenance as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBeGreaterThanOrEqual(5);
  });

  it('writes a SUGGESTED claim on insert, inside the same transaction', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.upsertWork(USER_ID, makeWork('W1'));

    const upsert = tx.publication_claims.upsert as ReturnType<typeof vi.fn>;
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: {
        output_id_user_id: { output_id: OUTPUT_ID, user_id: USER_ID },
      },
      create: {
        output_id: OUTPUT_ID,
        user_id: USER_ID,
        status: 'SUGGESTED',
        match_source: 'OPENALEX:W1',
        author_id: null,
        reviewed_at: null,
      },
      // No-op update: a re-pull never resurrects a CONFIRMED/REJECTED
      // decision the researcher already made.
      update: {},
    });
  });

  it('ensures the claim on re-import without touching an existing decision', async () => {
    const tx = makeTx({
      output_external_ids: {
        findUnique: vi.fn(async () => ({ output_id: OUTPUT_ID })),
        upsert: vi.fn(async () => ({})),
        create: vi.fn(async () => ({})),
      },
    });
    const { service } = makeService(tx);

    const result = await service.upsertWork(USER_ID, makeWork('W1'));

    expect(result).toMatchObject({ outputId: OUTPUT_ID, created: false });
    const upsert = tx.publication_claims.upsert as ReturnType<typeof vi.fn>;
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].update).toEqual({});
    expect(upsert.mock.calls[0][0].create.status).toBe('SUGGESTED');
  });

  it('ensures the claim on the DOI attach path for the second researcher', async () => {
    const tx = makeTx({
      research_outputs: {
        findUnique: vi.fn(async () => ({ id: OUTPUT_ID })),
        create: vi.fn(async () => ({ id: OUTPUT_ID })),
      },
    });
    const { service } = makeService(tx);

    const result = await service.upsertWork(
      USER_ID,
      makeWork('W2', { doi: '10.1234/dup' }),
    );

    expect(result).toMatchObject({ outputId: OUTPUT_ID, created: false });
    const upsert = tx.publication_claims.upsert as ReturnType<typeof vi.fn>;
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: {
        output_id_user_id: { output_id: OUTPUT_ID, user_id: USER_ID },
      },
      create: expect.objectContaining({
        status: 'SUGGESTED',
        match_source: 'OPENALEX:W2',
      }),
      update: {},
    });
  });

  it('re-importing the same work is a no-op returning the same output', async () => {
    const tx = makeTx({
      output_external_ids: {
        findUnique: vi.fn(async () => ({ output_id: OUTPUT_ID })),
        upsert: vi.fn(async () => ({})),
        create: vi.fn(async () => ({})),
      },
    });
    const { service } = makeService(tx);

    const result = await service.upsertWork(USER_ID, makeWork('W1'));

    expect(result).toMatchObject({ outputId: OUTPUT_ID, created: false });
    const create = tx.research_outputs.create as ReturnType<typeof vi.fn>;
    expect(create).not.toHaveBeenCalled();
  });

  it('attach path: same DOI links the external id and never inserts a work', async () => {
    const tx = makeTx({
      research_outputs: {
        findUnique: vi.fn(async () => ({ id: OUTPUT_ID })),
        create: vi.fn(async () => ({ id: OUTPUT_ID })),
      },
    });
    const { service } = makeService(tx);

    const result = await service.upsertWork(
      USER_ID,
      makeWork('W2', { doi: '10.1234/dup' }),
    );

    expect(result).toMatchObject({ outputId: OUTPUT_ID, created: false });
    expect(tx.research_outputs.create).not.toHaveBeenCalled();
    const upsert = tx.output_external_ids.upsert as ReturnType<typeof vi.fn>;
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      output_id: OUTPUT_ID,
      source: OPENALEX_SOURCE,
    });
  });

  it('attach links the researcher to their ORCID authorship row', async () => {
    const tx = makeTx({
      output_external_ids: {
        findUnique: vi.fn(async () => ({ output_id: OUTPUT_ID })),
        upsert: vi.fn(async () => ({})),
        create: vi.fn(async () => ({})),
      },
      output_authors: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => ({ user_id: null })),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
    });
    const { service } = makeService(tx);

    const result = await service.upsertWork(USER_ID, makeWork('W1'));

    expect(result.authorOrder).toBe(1);
    expect(tx.output_authors.update).toHaveBeenCalledOnce();
  });

  it('leaves authorship alone when the researcher matches no author', async () => {
    const tx = makeTx({
      researcher_profiles: {
        findUnique: vi.fn(async () => ({ orcid_id: '0000-0001-0000-0000' })),
      },
    });
    const { service } = makeService(tx);

    const result = await service.upsertWork(USER_ID, makeWork('W1'));

    expect(result.authorOrder).toBeNull();
    expect(tx.output_authors.create).toHaveBeenCalledTimes(2);
    const creates = (tx.output_authors.create as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(creates.every((call) => call[0].data.user_id === null)).toBe(true);
  });

  it('rejects with profile_not_found when there is no profile', async () => {
    const tx = makeTx({
      researcher_profiles: {
        findUnique: vi.fn(async () => null),
      },
    });
    const { service } = makeService(tx);

    const err = await service
      .upsertWork(USER_ID, makeWork('W1'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe('profile_not_found');
    expect((err as CodedHttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('skips provenance for null fields', async () => {
    const tx = makeTx();
    const { service, provenance } = makeService(tx);

    await service.upsertWork(
      USER_ID,
      makeWork('W3', { abstract: null, venue: null, doi: null }),
    );

    const calls = (
      provenance.recordProvenance as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => (call[1] as { fieldName: string }).fieldName);
    expect(calls).toContain('title');
    expect(calls).toContain('authors');
    expect(calls).not.toContain('abstract');
    expect(calls).not.toContain('venue');
    expect(calls).not.toContain('doi');
  });

  it('ingestWork fetches then upserts', async () => {
    const tx = makeTx();
    const { service, client } = makeService(tx);
    const work = makeWork('W9');
    (client.getWork as ReturnType<typeof vi.fn>).mockResolvedValue(work);

    const result = await service.ingestWork(USER_ID, 'W9');

    expect(client.getWork).toHaveBeenCalledWith('W9');
    expect(result.outputId).toBe(OUTPUT_ID);
  });
});
