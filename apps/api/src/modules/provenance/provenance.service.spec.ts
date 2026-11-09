import { HttpStatus } from '@nestjs/common';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { ProvenanceService } from './provenance.service.js';

const ENTITY = 'OUTPUT';
const ENTITY_ID = '00000000-0000-4000-8000-000000000001';

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    field_provenance: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async (args: unknown) => args),
      create: vi.fn(async (args: unknown) => args),
      update: vi.fn(async (args: unknown) => args),
      ...overrides,
    },
  } as unknown as Parameters<ProvenanceService['recordProvenance']>[0];
}

describe('ProvenanceService', () => {
  let service: ProvenanceService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ProvenanceService();
  });

  it('writes a provenance row in the caller transaction', async () => {
    const tx = makeTx();
    await service.recordProvenance(tx, {
      entityType: ENTITY,
      entityId: ENTITY_ID,
      fieldName: 'title',
      source: 'PAPER',
      sourceRef: 'OPENALEX:W2741809807',
      syncedAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(tx.field_provenance.upsert).toHaveBeenCalledOnce();
    const args = (tx.field_provenance.upsert as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    // The PK includes source_ref so an overwritten field keeps its history.
    expect(args.where).toEqual({
      entity_type_entity_id_field_name_source_ref: {
        entity_type: ENTITY,
        entity_id: ENTITY_ID,
        field_name: 'title',
        source_ref: 'OPENALEX:W2741809807',
      },
    });
    expect(args.create).toMatchObject({
      entity_type: ENTITY,
      source: 'PAPER',
    });
  });

  it('re-sync of the same origin upserts instead of failing', async () => {
    const tx = makeTx();
    const input = {
      entityType: ENTITY,
      entityId: ENTITY_ID,
      fieldName: 'venue',
      source: 'EXT' as const,
      sourceRef: 'OPENALEX:W2741809807',
    };
    await service.recordProvenance(tx, input);
    await service.recordProvenance(tx, input);
    expect(tx.field_provenance.upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects HUMAN: a user-typed field carries no row', async () => {
    const tx = makeTx();
    const err = await service
      .recordProvenance(tx, {
        entityType: ENTITY,
        entityId: ENTITY_ID,
        fieldName: 'bio',
        source: 'HUMAN',
        sourceRef: 'HUMAN:typed',
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe(
      'provenance_human_source_not_allowed',
    );
    expect((err as CodedHttpException).getStatus()).toBe(
      HttpStatus.BAD_REQUEST,
    );
    expect(tx.field_provenance.upsert).not.toHaveBeenCalled();
  });

  it('rejects verified_at on UNK', async () => {
    const tx = makeTx();
    const err = await service
      .recordProvenance(tx, {
        entityType: ENTITY,
        entityId: ENTITY_ID,
        fieldName: 'title',
        source: 'UNK',
        sourceRef: 'LEGACY:123',
        verifiedAt: new Date(),
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe(
      'provenance_unk_cannot_verify',
    );
  });

  it('rejects automatic verification of AI_INF', async () => {
    const tx = makeTx();
    const err = await service
      .recordProvenance(tx, {
        entityType: ENTITY,
        entityId: ENTITY_ID,
        fieldName: 'title',
        source: 'AI_INF',
        sourceRef: 'AI:suggest-1',
        verifiedAt: new Date(),
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe(
      'provenance_auto_verify_not_allowed',
    );
  });

  it('refuses a sync write when the field is locked', async () => {
    const tx = makeTx({
      findFirst: vi.fn(async () => ({ source_ref: 'HUMAN:confirmed' })),
    });
    const err = await service
      .recordProvenance(tx, {
        entityType: ENTITY,
        entityId: ENTITY_ID,
        fieldName: 'title',
        source: 'EXT',
        sourceRef: 'OPENALEX:W999',
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedHttpException);
    expect((err as CodedHttpException).message).toBe('provenance_field_locked');
    expect((err as CodedHttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect(tx.field_provenance.upsert).not.toHaveBeenCalled();
  });

  it('reports the lock without failing for skip-if-locked callers', async () => {
    const lockedTx = makeTx({
      findFirst: vi.fn(async () => ({ source_ref: 'HUMAN:confirmed' })),
    });
    const freeTx = makeTx();
    await expect(
      service.isFieldLocked(lockedTx, {
        entityType: ENTITY,
        entityId: ENTITY_ID,
        fieldName: 'title',
      }),
    ).resolves.toBe(true);
    await expect(
      service.isFieldLocked(freeTx, {
        entityType: ENTITY,
        entityId: ENTITY_ID,
        fieldName: 'title',
      }),
    ).resolves.toBe(false);
  });

  it('confirmField records a HUMAN row when the value was user-typed', async () => {
    const tx = makeTx();
    await service.confirmField(tx, {
      entityType: ENTITY,
      entityId: ENTITY_ID,
      fieldName: 'bio',
    });
    expect(tx.field_provenance.create).toHaveBeenCalledOnce();
    const args = (tx.field_provenance.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { data: Record<string, unknown> };
    expect(args.data).toMatchObject({
      entity_type: ENTITY,
      field_name: 'bio',
      source: 'HUMAN',
      is_locked: true,
    });
    expect(args.data['verified_at']).toBeInstanceOf(Date);
  });

  it('confirmField locks without verifying UNK and AI_INF rows', async () => {
    const rows = [
      { source_ref: 'LEGACY:1', source: 'UNK', verified_at: null },
      { source_ref: 'AI:1', source: 'AI_INF', verified_at: null },
      { source_ref: 'OPENALEX:W1', source: 'PAPER', verified_at: null },
    ];
    const tx = makeTx({
      findMany: vi.fn(async () => rows),
    });
    await service.confirmField(tx, {
      entityType: ENTITY,
      entityId: ENTITY_ID,
      fieldName: 'title',
    });
    expect(tx.field_provenance.update).toHaveBeenCalledTimes(3);
    const calls = (
      tx.field_provenance.update as ReturnType<typeof vi.fn>
    ).mock.calls.map((c) => c[0] as { data: Record<string, unknown> });
    // UNK and AI_INF lock with no verified_at; PAPER stamps it.
    expect(calls[0].data).toMatchObject({
      is_locked: true,
      verified_at: null,
    });
    expect(calls[1].data).toMatchObject({
      is_locked: true,
      verified_at: null,
    });
    expect(calls[2].data['is_locked']).toBe(true);
    expect(calls[2].data['verified_at']).toBeInstanceOf(Date);
  });
});
