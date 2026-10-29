import { type CallHandler } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { lastValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiResponseInterceptor } from './api-response.interceptor.js';

/**
 * Builds a handler that returns the given payload.
 */
function handlerFor(payload: unknown): CallHandler {
  return { handle: () => of(payload) };
}

describe('ApiResponseInterceptor', () => {
  let interceptor: ApiResponseInterceptor<unknown>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiResponseInterceptor],
    }).compile();

    interceptor = module.get(ApiResponseInterceptor);
  });

  it('wraps a payload in the envelope', async () => {
    const result = await lastValueFrom(
      interceptor.intercept({} as never, handlerFor({ status: 'ok' })),
    );

    expect(result).toEqual({
      success: true,
      data: { status: 'ok' },
      message: '',
    });
  });

  it('wraps a primitive payload', async () => {
    const result = await lastValueFrom(
      interceptor.intercept({} as never, handlerFor('Hello World!')),
    );

    expect(result).toEqual({
      success: true,
      data: 'Hello World!',
      message: '',
    });
  });

  it('produces a null data field when the handler returns nothing', async () => {
    const result = await lastValueFrom(
      interceptor.intercept({} as never, handlerFor(undefined)),
    );

    expect(result).toEqual({ success: true, data: null, message: '' });
  });

  it('produces a null data field when the handler returns null', async () => {
    const result = await lastValueFrom(
      interceptor.intercept({} as never, handlerFor(null)),
    );

    expect(result).toEqual({ success: true, data: null, message: '' });
  });

  it('does not wrap an already-wrapped payload twice', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        {} as never,
        handlerFor({ success: true, data: { id: 1 }, message: 'created' }),
      ),
    );

    expect(result).toEqual({
      success: true,
      data: { id: 1 },
      message: 'created',
    });
  });

  it('keeps the message of an already-wrapped payload', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        {} as never,
        handlerFor({ success: true, data: null, message: 'nothing to do' }),
      ),
    );

    expect(result.message).toBe('nothing to do');
  });

  it('does not treat a payload with a success field but no data field as an envelope', async () => {
    const result = await lastValueFrom(
      interceptor.intercept({} as never, handlerFor({ success: true })),
    );

    expect(result).toEqual({
      success: true,
      data: { success: true },
      message: '',
    });
  });

  it('does not treat a non-boolean success field as an envelope', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        {} as never,
        handlerFor({ success: 'yes', data: 'payload' }),
      ),
    );

    expect(result.data).toEqual({ success: 'yes', data: 'payload' });
  });
});
