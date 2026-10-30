import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter.js';

/**
 * Minimal stand-ins for the express request and response objects.
 */
function hostFor(
  exception: unknown,
  url = '/opportunities/abc',
  method = 'GET',
) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ url, method }),
      }),
    },
    status,
    json,
  };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('returns the error envelope', () => {
    const exception = new NotFoundException('Opportunity not found');
    const { host, status, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

    const body = json.mock.calls[0][0];

    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.message).toBe('Opportunity not found');
    expect(body.statusCode).toBe(404);
    expect(body.path).toBe('/opportunities/abc');
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('returns 500 for a non-http exception', () => {
    const exception = new Error('boom');
    const { host, status, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json.mock.calls[0][0].message).toBe('boom');
  });

  it('does not include the stack in the response', () => {
    const exception = new Error('boom');
    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('at ');
  });

  it('groups validation messages by field', () => {
    const exception = new BadRequestException({
      statusCode: 400,
      message: ['title must be a string', 'title should not be empty'],
      error: 'Bad Request',
    });

    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    const body = json.mock.calls[0][0];

    expect(body.errors).toEqual([
      {
        field: 'title',
        messages: ['must be a string', 'should not be empty'],
      },
    ]);
  });

  it('omits errors when the failure is not a validation failure', () => {
    const exception = new NotFoundException('nope');
    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(json.mock.calls[0][0].errors).toBeUndefined();
  });

  it('joins an array of messages when the fields cannot be parsed', () => {
    const exception = new HttpException(
      { statusCode: 400, message: ['first problem', 'second problem'] },
      HttpStatus.BAD_REQUEST,
    );

    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(json.mock.calls[0][0].message).toBe('first problem; second problem');
  });

  describe('database errors', () => {
    /**
     * Builds the exception Prisma produces when a driver adapter reports a
     * PostgreSQL failure. The shape was copied from a real error observed
     * against the live database.
     */
    function prismaError(postgresCode: string, message: string) {
      const error = new Error(
        'Invalid `prisma.outputFiles.create()` invocation',
      ) as Error & { code: string; meta?: unknown };

      error.code = 'P2039';
      error.meta = {
        modelName: 'OutputFiles',
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            originalCode: postgresCode,
            originalMessage: message,
            kind: 'postgres',
            code: postgresCode,
            severity: 'ERROR',
            message,
            detail: 'Failing row contains (1, 2, 3).',
          },
        },
      };

      return error;
    }

    it('answers 400 instead of 500 for a CHECK violation', () => {
      const exception = prismaError(
        '23514',
        'new row for relation "output_files" violates check constraint "ck_file_size"',
      );

      const { host, status, json } = hostFor(exception);

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

      const body = json.mock.calls[0][0];

      expect(body.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
    });

    it('does not leak the table or the constraint name', () => {
      const exception = prismaError(
        '23514',
        'new row for relation "output_files" violates check constraint "ck_file_size"',
      );

      const { host, json } = hostFor(exception);

      filter.catch(exception, host);

      const body = json.mock.calls[0][0];

      expect(body.message).not.toContain('output_files');
      expect(body.message).not.toContain('ck_file_size');
      expect(body.message).not.toContain('Failing row');
      expect(body.message).not.toContain('prisma.outputFiles');
    });

    it('answers 409 for a unique violation', () => {
      const exception = prismaError(
        '23505',
        'duplicate key value violates unique constraint "uq_users_email_normalized"',
      );

      const { host, status } = hostFor(exception);

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    });

    it('keeps a business rule message raised by a trigger', () => {
      const exception = prismaError(
        '23514',
        'opportunity 11111111-2222-3333-4444-555555555555 is not open (status is DRAFT)',
      );

      const { host, status, json } = hostFor(exception);

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(json.mock.calls[0][0].message).toContain('is not open');
    });

    it('still answers 500 for an unmapped database error', () => {
      const exception = prismaError('53300', 'too many connections');

      const { host, status, json } = hostFor(exception);

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json.mock.calls[0][0].message).toBe('Internal server error');
      expect(json.mock.calls[0][0].message).not.toContain('too many');
    });

    it('does not leak model and field names on a Prisma validation error', () => {
      const exception = new Error(
        'Invalid `prisma.researchOutputs.create()` invocation:\n\nArgument ownerId: Got invalid value',
      );

      exception.name = 'PrismaClientValidationError';

      const { host, status, json } = hostFor(exception);

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json.mock.calls[0][0].message).toBe('Internal server error');
      expect(json.mock.calls[0][0].message).not.toContain('researchOutputs');
      expect(json.mock.calls[0][0][0]).toBeUndefined();
    });

    it('keeps the envelope shape for a database error', () => {
      const exception = prismaError(
        '23514',
        'new row for relation "output_files" violates check constraint "ck_file_size"',
      );

      const { host, json } = hostFor(exception);

      filter.catch(exception, host);

      const body = json.mock.calls[0][0];

      expect(body.path).toBe('/opportunities/abc');
      expect(body.timestamp).toEqual(expect.any(String));
      expect(body.errors).toBeUndefined();
    });
  });
});
