import { HttpStatus, Injectable } from '@nestjs/common';
import type { DataProvenance, Prisma } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import {
  CHECK_VIOLATION_SQL_STATE,
  readDatabaseFailure,
} from '../../common/errors/database-errors.js';

/**
 * A single provenance write, paired with the field write it describes.
 *
 * The caller performs the entity write and this write inside the same
 * Prisma `$transaction` — the caller owns the transaction, this service
 * only receives it. A field written without its provenance is a defect,
 * so the pairing is structural: there is no standalone "write provenance
 * later" path.
 */
export interface RecordProvenanceInput {
  /** Polymorphic owner, e.g. `OUTPUT`, `RESEARCHER`. */
  entityType: string;
  /** Id of the owning row. */
  entityId: string;
  /** Column or logical field the value was written to. */
  fieldName: string;
  /**
   * Who stands behind the value. `HUMAN` is rejected: a user-typed field
   * is human by definition and carries no row.
   */
  source: DataProvenance;
  /** Concrete origin, e.g. `OPENALEX:W2741809807`. */
  sourceRef: string;
  /** When the value was last pulled from the origin. */
  syncedAt?: Date;
  /**
   * When a human verified the value. Never set for `UNK` or `AI_INF`
   * (see `docs/database.md` §5.2.4) — use `confirmField` instead, which
   * locks without stamping an automatic verification.
   */
  verifiedAt?: Date | null;
}

/**
 * The OpenAlex field-to-provenance mapping owned by RES-14.
 *
 * The client subtask RES-136 documents this table as a reference; the rule
 * lives here, next to the writer that enforces it. OpenAlex has no
 * publisher/volume/pages, and the abstract arrives as an inverted index —
 * the reconstruction step happens in the ingest, the classification
 * happens here.
 */
export const OPENALEX_FIELD_PROVENANCE = {
  title: 'PAPER',
  abstract: 'PAPER',
  authors: 'PAPER',
  venue: 'EXT',
  publication_year: 'EXT',
  doi: 'EXT',
} as const satisfies Record<string, DataProvenance>;

export type OpenAlexProvenanceField = keyof typeof OPENALEX_FIELD_PROVENANCE;

/**
 * The single writer for `field_provenance`.
 *
 * Every ingest path (OpenAlex pull, AI inference, legacy import) calls
 * `recordProvenance` inside its own transaction. Nothing else writes the
 * table. The lock rule lives here too: a field a human has confirmed
 * (`is_locked`) is never overwritten by a later sync — the override
 * direction is one-way, human wins over machine.
 */
@Injectable()
export class ProvenanceService {
  /**
   * Records where an auto-generated field value came from.
   *
   * Must be called with the same transaction client as the field write,
   * so a rolled-back field write rolls back its provenance too. Rejects
   * when the field is locked by a human confirmation.
   */
  async recordProvenance(
    tx: Prisma.TransactionClient,
    input: RecordProvenanceInput,
  ): Promise<void> {
    const entityType = input.entityType?.trim();
    const fieldName = input.fieldName?.trim();
    const sourceRef = input.sourceRef?.trim();

    if (!entityType || entityType.length > 64) {
      throw new CodedHttpException(
        domainErrorCodes.provenance.humanSourceNotAllowed,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!fieldName || fieldName.length > 64) {
      throw new CodedHttpException(
        domainErrorCodes.provenance.humanSourceNotAllowed,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!sourceRef) {
      throw new CodedHttpException(
        domainErrorCodes.provenance.humanSourceNotAllowed,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!input.entityId) {
      throw new CodedHttpException(
        domainErrorCodes.provenance.humanSourceNotAllowed,
        HttpStatus.BAD_REQUEST,
      );
    }

    // User-typed fields are HUMAN by definition and carry no row. A HUMAN
    // source reaching the writer means the caller paired the wrong path.
    if (input.source === 'HUMAN') {
      throw new CodedHttpException(
        domainErrorCodes.provenance.humanSourceNotAllowed,
        HttpStatus.BAD_REQUEST,
      );
    }

    // UNK has no attributable origin, so there is nothing to verify.
    // AI_INF has no replayable trace, so it is never auto-promoted.
    if (input.verifiedAt && input.source === 'UNK') {
      throw new CodedHttpException(
        domainErrorCodes.provenance.unkCannotVerify,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.verifiedAt && input.source === 'AI_INF') {
      throw new CodedHttpException(
        domainErrorCodes.provenance.autoVerifyNotAllowed,
        HttpStatus.BAD_REQUEST,
      );
    }

    // The lock is read before any write: a human-confirmed value is never
    // overwritten by a later sync. The database trigger
    // `guard_field_provenance_lock` is the backstop; this check is the
    // readable error.
    const locked = await tx.field_provenance.findFirst({
      where: {
        entity_type: entityType,
        entity_id: input.entityId,
        field_name: fieldName,
        is_locked: true,
      },
      select: { source_ref: true },
    });
    if (locked) {
      throw new CodedHttpException(
        domainErrorCodes.provenance.fieldLocked,
        HttpStatus.CONFLICT,
      );
    }

    try {
      // The primary key includes source_ref on purpose: an overwritten
      // field keeps its history, so a re-sync of the same origin upserts
      // instead of failing.
      await tx.field_provenance.upsert({
        where: {
          entity_type_entity_id_field_name_source_ref: {
            entity_type: entityType,
            entity_id: input.entityId,
            field_name: fieldName,
            source_ref: sourceRef,
          },
        },
        create: {
          entity_type: entityType,
          entity_id: input.entityId,
          field_name: fieldName,
          source: input.source,
          source_ref: sourceRef,
          synced_at: input.syncedAt ?? null,
          verified_at: input.verifiedAt ?? null,
        },
        update: {
          synced_at: input.syncedAt ?? null,
        },
      });
    } catch (error) {
      this.rethrowProvenanceConstraintError(error);
      throw error;
    }
  }

  /**
   * Locks a field after a human confirms its value.
   *
   * This is the only path that sets `is_locked`. The sync path
   * (`recordProvenance`) never sets it, so the flag always means "a
   * person stood behind this value". Verification is stamped only when
   * the source allows it — `UNK` and `AI_INF` rows lock without a
   * `verified_at`, because neither may be auto-verified.
   */
  async confirmField(
    tx: Prisma.TransactionClient,
    input: {
      entityType: string;
      entityId: string;
      fieldName: string;
      sourceRef?: string;
    },
  ): Promise<void> {
    const where = {
      entity_type: input.entityType.trim(),
      entity_id: input.entityId,
      field_name: input.fieldName.trim(),
    };
    if (!where.entity_type || !where.field_name || !where.entity_id) {
      throw new CodedHttpException(
        domainErrorCodes.provenance.humanSourceNotAllowed,
        HttpStatus.BAD_REQUEST,
      );
    }

    const rows = await tx.field_provenance.findMany({ where });
    if (rows.length === 0) {
      // A user-typed value has no provenance row by design; confirming it
      // records the human as the origin so later syncs see the lock.
      const sourceRef = input.sourceRef?.trim() || 'HUMAN:confirmed';
      await tx.field_provenance.create({
        data: {
          ...where,
          source: 'HUMAN',
          source_ref: sourceRef,
          verified_at: new Date(),
          is_locked: true,
        },
      });
      return;
    }

    for (const row of rows) {
      const verifiable = row.source !== 'UNK' && row.source !== 'AI_INF';
      await tx.field_provenance.update({
        where: {
          entity_type_entity_id_field_name_source_ref: {
            ...where,
            source_ref: row.source_ref,
          },
        },
        data: {
          is_locked: true,
          verified_at: verifiable ? (row.verified_at ?? new Date()) : null,
        },
      });
    }
  }

  /**
   * Whether a human has locked a field against sync overwrites.
   *
   * Sync jobs read this before writing; `recordProvenance` already does,
   * so this is for callers that need to skip a field without failing.
   */
  async isFieldLocked(
    tx: Prisma.TransactionClient,
    input: { entityType: string; entityId: string; fieldName: string },
  ): Promise<boolean> {
    const locked = await tx.field_provenance.findFirst({
      where: {
        entity_type: input.entityType,
        entity_id: input.entityId,
        field_name: input.fieldName,
        is_locked: true,
      },
      select: { source_ref: true },
    });
    return locked !== null;
  }

  /**
   * Maps the database's own provenance answers onto domain codes.
   *
   * The service pre-validates everything it can, but the CHECK
   * constraints and the lock trigger are the authority — a concurrent
   * writer can lock between the check and the insert. Constraint names
   * come from PostgreSQL's wording (see `database-errors.ts`), never from
   * message matching.
   */
  private rethrowProvenanceConstraintError(error: unknown): void {
    if (error instanceof CodedHttpException) {
      throw error;
    }
    const failure = readDatabaseFailure(error);
    if (!failure) {
      return;
    }
    if (failure.sqlState !== CHECK_VIOLATION_SQL_STATE) {
      return;
    }
    if (
      failure.constraintName === 'ck_field_provenance_unk_unverified' ||
      failure.constraintName === 'ck_field_provenance_no_auto_verify'
    ) {
      throw new CodedHttpException(
        failure.constraintName === 'ck_field_provenance_unk_unverified'
          ? domainErrorCodes.provenance.unkCannotVerify
          : domainErrorCodes.provenance.autoVerifyNotAllowed,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!failure.constraintName) {
      // The lock guard raises without naming a constraint.
      throw new CodedHttpException(
        domainErrorCodes.provenance.fieldLocked,
        HttpStatus.CONFLICT,
      );
    }
  }
}
