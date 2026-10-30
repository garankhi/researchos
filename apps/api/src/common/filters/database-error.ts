import { HttpStatus } from '@nestjs/common';

/**
 * Translates a database failure into an HTTP response.
 *
 * `ResearchOS.sql` owns the schema, and much of it is invisible to Prisma:
 * 47 CHECK constraints, 91 DEFERRABLE foreign keys, a trigger and two views.
 * When one of those rejects a write, Prisma surfaces a
 * `PrismaClientKnownRequestError` that carries the underlying PostgreSQL
 * error code.
 *
 * Without this translation a rejected write is indistinguishable from a
 * server fault. The global filter only maps NestJS `HttpException`s, so
 * every other exception becomes a 500. A user who submits a negative file
 * size would be told "Internal Server Error" for what is really bad input.
 *
 * Two rules shape the message:
 *
 * - A message the *database* generated (`... violates check constraint
 *   "ck_file_size"`) names internal objects and leaks the failing row. It is
 *   replaced with a generic sentence.
 * - A message the *application* wrote (a trigger using `RAISE EXCEPTION`)
 *   is written for humans and is safe to show, so it is passed through with
 *   UUIDs redacted.
 */

/** The HTTP response a database failure is translated into. */
export interface DatabaseErrorMapping {
  /** The HTTP status code to answer with. */
  status: number;
  /** The message to send to the client. */
  message: string;
}

/**
 * PostgreSQL error codes, mapped to the status code they deserve.
 *
 * `23514` is `check_violation`. The trigger in `ResearchOS.sql` raises
 * business-rule failures with that same code, which is why a trigger error
 * and a CHECK violation are handled identically.
 */
const POSTGRES_CODE_STATUS: Record<string, number> = {
  '23502': HttpStatus.BAD_REQUEST, // not_null_violation
  '23503': HttpStatus.BAD_REQUEST, // foreign_key_violation
  '23505': HttpStatus.CONFLICT, // unique_violation
  '23514': HttpStatus.BAD_REQUEST, // check_violation
};

/**
 * The generic message for each PostgreSQL error code.
 *
 * These never mention a table, a column or a constraint name. The specific
 * details go to the log instead.
 */
const POSTGRES_CODE_MESSAGE: Record<string, string> = {
  '23502': 'A required field is missing.',
  '23503':
    'The request references a record that does not exist or is still in use.',
  '23505': 'A record with these values already exists.',
  '23514': 'The submitted data violates a database constraint.',
};

/**
 * Prisma's own error codes, used when the PostgreSQL code is not available.
 *
 * These are the codes Prisma reports when its own engine, rather than a
 * driver adapter, produced the error.
 */
const PRISMA_CODE_STATUS: Record<string, number> = {
  P2002: HttpStatus.CONFLICT, // unique constraint
  P2003: HttpStatus.BAD_REQUEST, // foreign key constraint
  P2014: HttpStatus.BAD_REQUEST, // required relation missing
  P2025: HttpStatus.NOT_FOUND, // record not found
  P2034: HttpStatus.CONFLICT, // transaction conflict
};

const PRISMA_CODE_MESSAGE: Record<string, string> = {
  P2002: 'A record with these values already exists.',
  P2003:
    'The request references a record that does not exist or is still in use.',
  P2014: 'A required field is missing.',
  P2025: 'The requested record was not found.',
  P2034: 'The request conflicted with another transaction. Please retry.',
};

/**
 * The message used when a failure is a genuine server fault.
 *
 * It says nothing about the internals: no model name, no field name, no SQL.
 * The detail goes to the log instead.
 */
const GENERIC_INTERNAL_MESSAGE = 'Internal server error';

/**
 * Matches a message the PostgreSQL server generated itself.
 *
 * Such a message always quotes the name of the database object it refers to,
 * which is exactly the internal detail that must not reach the client. A
 * message written by a trigger does not match, because it is written for
 * humans.
 */
const POSTGRES_GENERATED_MESSAGE =
  /constraint\s+"[^"]+"|violates\s+not-null\s+constraint/i;

/** Matches a UUID, which is redacted from application-authored messages. */
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Maps a database error onto an HTTP status and a client-safe message.
 *
 * Returns undefined when the exception did not come from the database, so
 * the caller can fall back to its own handling.
 *
 * @param exception The thrown value.
 * @returns The mapping, or undefined when the error is not a database error.
 */
export function mapDatabaseError(
  exception: unknown,
): DatabaseErrorMapping | undefined {
  if (!isDatabaseError(exception)) {
    return undefined;
  }

  const postgresCode = readPostgresCode(exception);
  const driverMessage = readDriverMessage(exception);
  const prismaCode = readPrismaCode(exception);

  if (postgresCode) {
    const status = POSTGRES_CODE_STATUS[postgresCode];
    const generic = POSTGRES_CODE_MESSAGE[postgresCode];

    if (status === undefined || generic === undefined) {
      // An unmapped PostgreSQL code is a genuine server-side problem (a
      // connection failure, a syntax error), so it keeps the default 500.
      // The raw message is not sent, because it can name internal objects.
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: GENERIC_INTERNAL_MESSAGE,
      };
    }

    if (!driverMessage) {
      return { status, message: generic };
    }

    // A message the application wrote is meant to be read by the user.
    if (!POSTGRES_GENERATED_MESSAGE.test(driverMessage)) {
      return { status, message: redact(driverMessage) };
    }

    return { status, message: generic };
  }

  if (prismaCode) {
    const status = PRISMA_CODE_STATUS[prismaCode];
    const message = PRISMA_CODE_MESSAGE[prismaCode];

    if (status === undefined || message === undefined) {
      // An unmapped Prisma error is not a known request failure, so it is
      // treated as a server fault. The generic message is used because a
      // raw Prisma message spells out model and field names.
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: GENERIC_INTERNAL_MESSAGE,
      };
    }

    return { status, message };
  }

  // A Prisma error with no usable code — most often a validation error
  // raised because the application passed an argument Prisma does not
  // recognise. That is a bug in the caller, so it is a server fault, and
  // the raw message (which lists model and field names) is not sent.
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: GENERIC_INTERNAL_MESSAGE,
  };
}

/**
 * True when the exception looks like a database failure.
 *
 * The check is structural rather than `instanceof`, because the concrete
 * class lives in the generated Prisma client and the filter must not depend
 * on it. A Prisma request error always carries a `code` that starts with
 * `P`; a validation error carries no code, so it is recognised by name.
 */
function isDatabaseError(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) {
    return false;
  }

  const candidate = exception as { code?: unknown; name?: unknown };

  if (typeof candidate.code === 'string' && /^P\d{4}$/.test(candidate.code)) {
    return true;
  }

  return (
    typeof candidate.name === 'string' &&
    candidate.name.startsWith('PrismaClient') &&
    candidate.name.endsWith('Error')
  );
}

/**
 * Reads the Prisma error code, for example `P2039`.
 */
function readPrismaCode(exception: unknown): string | undefined {
  const code = (exception as { code?: unknown }).code;

  return typeof code === 'string' ? code : undefined;
}

/**
 * Reads the PostgreSQL error code out of the driver error.
 *
 * With a driver adapter, Prisma wraps the original PostgreSQL error and
 * keeps the SQLSTATE in `meta.driverAdapterError.cause.originalCode`.
 */
function readPostgresCode(exception: unknown): string | undefined {
  const cause = readDriverCause(exception);

  if (!cause) {
    return undefined;
  }

  const original = (cause as { originalCode?: unknown }).originalCode;

  if (typeof original === 'string') {
    return original;
  }

  const code = (cause as { code?: unknown }).code;

  return typeof code === 'string' ? code : undefined;
}

/**
 * Reads the message the database produced, without the Prisma prefix.
 */
function readDriverMessage(exception: unknown): string | undefined {
  const cause = readDriverCause(exception);

  if (!cause) {
    return undefined;
  }

  const message =
    (cause as { message?: unknown }).message ??
    (cause as { originalMessage?: unknown }).originalMessage;

  return typeof message === 'string' ? message : undefined;
}

/**
 * Walks to `meta.driverAdapterError.cause`, if the exception carries one.
 */
function readDriverCause(exception: unknown): unknown {
  const meta = (exception as { meta?: unknown }).meta;

  if (typeof meta !== 'object' || meta === null) {
    return undefined;
  }

  const driverError = (meta as { driverAdapterError?: unknown })
    .driverAdapterError;

  if (typeof driverError !== 'object' || driverError === null) {
    return undefined;
  }

  const cause = (driverError as { cause?: unknown }).cause;

  return typeof cause === 'object' && cause !== null ? cause : undefined;
}

/**
 * Replaces UUIDs with a placeholder.
 *
 * An identifier is an internal detail. The message still reads correctly
 * without it.
 */
function redact(message: string): string {
  return message.replace(UUID_PATTERN, '<id>');
}
