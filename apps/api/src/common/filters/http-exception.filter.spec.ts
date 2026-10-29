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
function hostFor(exception: unknown, url = '/opportunities/abc', method = 'GET') {
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
});
