import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { mapDatabaseError } from './database-error.js';

/**
 * Builds an exception shaped like the ones Prisma produces when a driver
 * adapter reports a PostgreSQL failure.
 *
 * The shape is copied from a real error observed against the live
 * database: the SQLSTATE lives in `meta.driverAdapterError.cause.originalCode`
 * and the message in `meta.driverAdapterError.cause.message`.
 */
function prismaError(options: {
  code?: string;
  postgresCode?: string;
  message?: string;
}): Error & { code: string; meta?: unknown } {
  const error = new Error(
    'Invalid `prisma.outputFiles.create()` invocation',
  ) as Error & { code: string; meta?: unknown };

  error.code = options.code ?? 'P2039';

  if (options.postgresCode) {
    error.meta = {
      modelName: 'OutputFiles',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: options.postgresCode,
          originalMessage: options.message,
          kind: 'postgres',
          code: options.postgresCode,
          severity: 'ERROR',
          message: options.message,
          detail: 'Failing row contains (1, 2, 3).',
        },
      },
    };
  }

  return error;
}

describe('mapDatabaseError', () => {
  it('returns undefined for an exception that is not a database error', () => {
    expect(mapDatabaseError(new Error('boom'))).toBeUndefined();
    expect(mapDatabaseError('a string')).toBeUndefined();
    expect(mapDatabaseError(undefined)).toBeUndefined();
    expect(mapDatabaseError(null)).toBeUndefined();
  });

  it('answers 500 without detail for a Prisma error with an unknown code', () => {
    const mapping = mapDatabaseError(prismaError({ code: 'P9999' }));

    expect(mapping?.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mapping?.message).toBe('Internal server error');
  });

  it('answers 500 without detail for a Prisma validation error', () => {
    const error = new Error(
      'Invalid `prisma.researchOutputs.create()` invocation:\n\nArgument ownerId: Got invalid value',
    );

    error.name = 'PrismaClientValidationError';

    const mapping = mapDatabaseError(error);

    expect(mapping?.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mapping?.message).toBe('Internal server error');
    expect(mapping?.message).not.toContain('researchOutputs');
    expect(mapping?.message).not.toContain('ownerId');
  });

  it('maps a CHECK violation to 400', () => {
    const mapping = mapDatabaseError(
      prismaError({
        postgresCode: '23514',
        message:
          'new row for relation "output_files" violates check constraint "ck_file_size"',
      }),
    );

    expect(mapping?.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps a foreign key violation to 400', () => {
    const mapping = mapDatabaseError(
      prismaError({
        postgresCode: '23503',
        message:
          'insert or update on table "output_files" violates foreign key constraint "fk"',
      }),
    );

    expect(mapping?.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps a unique violation to 409', () => {
    const mapping = mapDatabaseError(
      prismaError({
        postgresCode: '23505',
        message:
          'duplicate key value violates unique constraint "uq_users_email_normalized"',
      }),
    );

    expect(mapping?.status).toBe(HttpStatus.CONFLICT);
  });

  it('maps a NOT NULL violation to 400', () => {
    const mapping = mapDatabaseError(
      prismaError({
        postgresCode: '23502',
        message:
          'null value in column "storage_key" violates not-null constraint',
      }),
    );

    expect(mapping?.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('does not leak the constraint name or the failing row', () => {
    const mapping = mapDatabaseError(
      prismaError({
        postgresCode: '23514',
        message:
          'new row for relation "output_files" violates check constraint "ck_file_size"',
      }),
    );

    expect(mapping?.message).not.toContain('ck_file_size');
    expect(mapping?.message).not.toContain('output_files');
    expect(mapping?.message).not.toContain('Failing row');
  });

  it('keeps a message that the application wrote', () => {
    const mapping = mapDatabaseError(
      prismaError({
        postgresCode: '23514',
        message:
          'opportunity 11111111-2222-3333-4444-555555555555 is not open (status is DRAFT)',
      }),
    );

    expect(mapping?.status).toBe(HttpStatus.BAD_REQUEST);
    expect(mapping?.message).toContain('is not open');
    expect(mapping?.message).toContain('DRAFT');
  });

  it('redacts a UUID from an application written message', () => {
    const mapping = mapDatabaseError(
      prismaError({
        postgresCode: '23514',
        message:
          'opportunity 11111111-2222-3333-4444-555555555555 is not open (status is DRAFT)',
      }),
    );

    expect(mapping?.message).not.toContain(
      '11111111-2222-3333-4444-555555555555',
    );
    expect(mapping?.message).toContain('<id>');
  });

  it('falls back to the generic message when the driver message is missing', () => {
    const mapping = mapDatabaseError(prismaError({ postgresCode: '23514' }));

    expect(mapping?.status).toBe(HttpStatus.BAD_REQUEST);
    expect(mapping?.message).toBe(
      'The submitted data violates a database constraint.',
    );
  });

  it('falls back to the Prisma code when there is no PostgreSQL code', () => {
    const mapping = mapDatabaseError(prismaError({ code: 'P2002' }));

    expect(mapping?.status).toBe(HttpStatus.CONFLICT);
    expect(mapping?.message).toBe('A record with these values already exists.');
  });

  it('maps P2025 to 404', () => {
    const mapping = mapDatabaseError(prismaError({ code: 'P2025' }));

    expect(mapping?.status).toBe(HttpStatus.NOT_FOUND);
  });

  it('answers 500 for an unmapped PostgreSQL code', () => {
    const mapping = mapDatabaseError(
      prismaError({
        postgresCode: '53300',
        message: 'too many connections',
      }),
    );

    expect(mapping?.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mapping?.message).toBe('Internal server error');
    expect(mapping?.message).not.toContain('too many connections');
  });
});
