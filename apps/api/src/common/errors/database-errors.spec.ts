import { describe, expect, it } from 'vitest';
import { readDatabaseFailure } from './database-errors.js';

/**
 * The shapes below are the ones Prisma 7.10 actually produces against
 * PostgreSQL, captured from the `pg` driver adapter.
 */
function knownRequestError(
  code: string,
  message: string,
  cause?: Record<string, unknown>,
): Error & { code: string; meta: Record<string, unknown> } {
  return {
    name: 'PrismaClientKnownRequestError',
    message,
    code,
    meta: cause
      ? { driverAdapterError: { name: 'DriverAdapterError', cause } }
      : {},
  } as Error & { code: string; meta: Record<string, unknown> };
}

describe('readDatabaseFailure', () => {
  it('reads the SQLSTATE and constraint of a unique violation', () => {
    const failure = readDatabaseFailure(
      knownRequestError(
        'P2002',
        'Unique constraint failed on the constraint: `uq_users_email_normalized`',
        {
          originalCode: '23505',
          originalMessage:
            'duplicate key value violates unique constraint "uq_users_email_normalized"',
          kind: 'UniqueConstraintViolation',
          constraint: { index: 'uq_users_email_normalized' },
          table: 'users',
        },
      ),
    );

    expect(failure).toEqual({
      prismaCode: 'P2002',
      sqlState: '23505',
      constraintName: 'uq_users_email_normalized',
      message:
        'duplicate key value violates unique constraint "uq_users_email_normalized"',
    });
  });

  it('reads the constraint name of a check violation out of the message', () => {
    const failure = readDatabaseFailure(
      knownRequestError('P2039', 'Database error. Code: `23514`.', {
        originalCode: '23514',
        originalMessage:
          'new row for relation "user_role_assignments" violates check constraint "ck_no_self_grant"',
        kind: 'postgres',
        code: '23514',
      }),
    );

    expect(failure?.sqlState).toBe('23514');
    expect(failure?.constraintName).toBe('ck_no_self_grant');
  });

  it('reports no constraint for the last-admin guard, which names none', () => {
    const failure = readDatabaseFailure(
      knownRequestError('P2010', 'Raw query failed. Code: `23514`.', {
        originalCode: '23514',
        originalMessage:
          'Cannot remove the last active admin; appoint another active admin first',
        kind: 'postgres',
        code: '23514',
      }),
    );

    expect(failure?.sqlState).toBe('23514');
    expect(failure?.constraintName).toBeUndefined();
  });

  it('ignores an error that did not come from the database', () => {
    expect(readDatabaseFailure(new Error('boom'))).toBeUndefined();
    expect(readDatabaseFailure('boom')).toBeUndefined();
    expect(readDatabaseFailure(undefined)).toBeUndefined();
  });

  it('ignores a Prisma error without a driver adapter cause', () => {
    const failure = readDatabaseFailure(
      knownRequestError('P2002', 'Unique constraint failed'),
    );

    expect(failure?.prismaCode).toBe('P2002');
    expect(failure?.sqlState).toBeUndefined();
    expect(failure?.constraintName).toBeUndefined();
  });
});
