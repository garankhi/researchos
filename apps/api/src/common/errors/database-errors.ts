/**
 * Reading a PostgreSQL failure out of a Prisma error.
 *
 * Prisma 7 with the `pg` driver adapter reports a failed statement as a
 * `PrismaClientKnownRequestError`. The database's own answer is in
 * `meta.driverAdapterError.cause`:
 *
 * - `originalCode` — the SQLSTATE PostgreSQL reported: `23505` for a unique
 *   violation, `23514` for a check violation.
 * - `constraint` — the name of the violated constraint, for unique
 *   violations (`{ index: "uq_users_email_normalized" }`).
 * - `originalMessage` — the message PostgreSQL produced.
 *
 * `meta.target` — the field older Prisma versions used for the violated
 * columns — **does not exist** here. Reading it always yields `undefined`,
 * so a column-name lookup cannot work.
 *
 * A check violation names its constraint in the message rather than in a
 * field, so the name is read out of PostgreSQL's own wording:
 * `new row for relation "users" violates check constraint "ck_no_self_grant"`.
 */

/** A PostgreSQL failure, reduced to the parts that identify what failed. */
export interface DatabaseFailure {
  /**
   * Prisma's own error code: `P2002` (unique violation), `P2010` (raw query
   * failed), `P2039` (database error).
   */
  prismaCode: string;
  /** The SQLSTATE PostgreSQL reported, e.g. `23505`. */
  sqlState?: string;
  /**
   * The name of the violated constraint, when the database named one.
   *
   * A table `CHECK` constraint and a unique index both name themselves. A
   * `RAISE EXCEPTION` from a helper function does not — that is what tells
   * the two apart.
   */
  constraintName?: string;
  /** The message PostgreSQL produced. */
  message: string;
}

/** A unique violation — `23505`. */
export const UNIQUE_VIOLATION_SQL_STATE = '23505';
/** A check violation — `23514`. */
export const CHECK_VIOLATION_SQL_STATE = '23514';

/** PostgreSQL's wording for a violated `CHECK` constraint. */
const CHECK_CONSTRAINT_PATTERN = /violates check constraint "([^"]+)"/;
/** PostgreSQL's wording for a violated unique constraint. */
const UNIQUE_CONSTRAINT_PATTERN = /violates unique constraint "([^"]+)"/;

interface DriverAdapterCause {
  originalCode?: unknown;
  code?: unknown;
  originalMessage?: unknown;
  message?: unknown;
  constraint?: unknown;
}

/**
 * Whether the error is one Prisma raised for a failed database statement.
 *
 * The check is on the shape rather than on `instanceof`: the class is
 * re-exported through `@researchos/database`, and a duck-typed check keeps
 * the reading working even if the error crosses a module boundary.
 */
function isKnownRequestError(
  error: unknown,
): error is Error & { code: string; meta?: Record<string, unknown> } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('P') &&
    (error as { message?: unknown }).message !== undefined
  );
}

function driverAdapterCause(
  meta: Record<string, unknown> | undefined,
): DriverAdapterCause | undefined {
  const adapterError = meta?.['driverAdapterError'] as
    { cause?: DriverAdapterCause } | undefined;

  const cause = adapterError?.cause;
  return typeof cause === 'object' && cause !== null ? cause : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The constraint name a unique violation reports.
 *
 * The adapter exposes it as `{ index: "uq_users_email_normalized" }`. A
 * violation reported by field names instead of an index name carries no
 * constraint name, so it yields `undefined`.
 */
function uniqueConstraintName(cause: DriverAdapterCause): string | undefined {
  const constraint = cause.constraint;
  if (typeof constraint !== 'object' || constraint === null) {
    return undefined;
  }

  return asString((constraint as { index?: unknown }).index);
}

/**
 * Reads the PostgreSQL failure out of a Prisma error.
 *
 * Returns `undefined` for an error that did not come from the database, so
 * the caller can let it through untouched.
 */
export function readDatabaseFailure(
  error: unknown,
): DatabaseFailure | undefined {
  if (!isKnownRequestError(error)) {
    return undefined;
  }

  const cause = driverAdapterCause(error.meta);
  const message =
    asString(cause?.originalMessage) ??
    asString(cause?.message) ??
    error.message;

  const constraintName =
    uniqueConstraintName(cause ?? {}) ??
    CHECK_CONSTRAINT_PATTERN.exec(message)?.[1] ??
    UNIQUE_CONSTRAINT_PATTERN.exec(message)?.[1];

  return {
    prismaCode: error.code,
    sqlState: asString(cause?.originalCode) ?? asString(cause?.code),
    constraintName,
    message,
  };
}
