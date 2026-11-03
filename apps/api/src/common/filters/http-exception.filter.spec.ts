import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodedHttpException, domainErrorCodes } from '../errors/error-codes.js';
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
    expect(body.statusCode).toBe(404);
    expect(body.path).toBe('/opportunities/abc');
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('sends the generic code for the status, not the exception message', () => {
    const exception = new NotFoundException('Opportunity not found');
    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    // The message is a code, not prose. The wording lives in the frontend's
    // message catalog, so the server never sends English to a user.
    expect(json.mock.calls[0][0].message).toBe('not_found');
  });

  it('sends the domain code when the exception carries one', () => {
    const exception = new CodedHttpException(
      domainErrorCodes.opportunities.notFound,
      HttpStatus.NOT_FOUND,
    );
    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(json.mock.calls[0][0].message).toBe('opportunity_not_found');
    expect(json.mock.calls[0][0].statusCode).toBe(404);
  });

  it('returns 500 for a non-http exception', () => {
    const exception = new Error('boom');
    const { host, status, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json.mock.calls[0][0].message).toBe('server_error');
  });

  it('does not include the stack in the response', () => {
    const exception = new Error('boom');
    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('at ');
  });

  it('groups validation messages by field', () => {
    // The global ValidationPipe runs in the `grouped` error format, so the
    // exception's `message` is a record keyed by the property path.
    const exception = new BadRequestException({
      statusCode: 400,
      message: { title: ['title_required', 'title_invalid'] },
      error: 'Bad Request',
    });

    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    const body = json.mock.calls[0][0];

    expect(body.message).toBe('validation_failed');
    expect(body.errors).toEqual([
      {
        field: 'title',
        messages: ['title_required', 'title_invalid'],
      },
    ]);
  });

  it('keeps a nested field path intact', () => {
    const exception = new BadRequestException({
      statusCode: 400,
      message: { 'items.0.name': ['name_required'] },
      error: 'Bad Request',
    });

    const { host, json } = hostFor(exception);

    filter.catch(exception, host);

    expect(json.mock.calls[0][0].errors).toEqual([
      { field: 'items.0.name', messages: ['name_required'] },
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

    // A flat array is not the grouped shape, so there are no field errors —
    // but the message is still a code.
    expect(json.mock.calls[0][0].message).toBe('validation_failed');
    expect(json.mock.calls[0][0].errors).toBeUndefined();
  });
});
