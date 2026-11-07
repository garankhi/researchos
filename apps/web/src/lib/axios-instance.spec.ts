import { describe, expect, it, expectTypeOf } from 'vitest';
import { AxiosError } from 'axios';
import type { AxiosAdapter, AxiosResponse } from 'axios';
import { AXIOS_INSTANCE, axiosInstance, isEnvelope } from './axios-instance';
import { apiErrorCode } from './api-error';
import type { Unwrap } from './axios-instance';
import type {
  HealthStatusDto,
  HealthStatusDtoEnvelope,
} from '@/lib/api/models';

/**
 * The envelope unwrapping is the contract between the backend and the
 * frontend, so it is pinned here.
 *
 * The backend wraps every successful response in
 * `{ success, data, message }`. Orval generates the operation with the
 * *envelope* type as its generic parameter, and the `Unwrap<T>` conditional
 * type turns that wire type back into the payload type the caller wants.
 *
 * If this breaks, the failure is quiet and wrong: `query.data` is typed as
 * the payload but holds the envelope at runtime, so a screen reads
 * `data.status` as `undefined` and renders an empty state instead of the
 * data that arrived.
 */

/**
 * An adapter that answers with a fixed body, so no network is involved.
 *
 * It settles the response the way the real adapters do: a status outside
 * `validateStatus` rejects with an `AxiosError` that carries the response.
 * Without that, a `404` would resolve as a successful response and the
 * error helpers would never see it.
 */
function adapterFor(body: unknown, status = 200): AxiosAdapter {
  return async (config) => {
    const response = {
      data: body,
      status,
      statusText: 'OK',
      headers: {},
      config,
    } as AxiosResponse;

    const validateStatus = config.validateStatus ?? defaultValidateStatus;

    if (!validateStatus(status)) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        response,
      );
    }

    return response;
  };
}

/**
 * Axios's own default: any status below 500 is a success.
 */
function defaultValidateStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

describe('isEnvelope', () => {
  it('recognises a success envelope', () => {
    expect(
      isEnvelope({ success: true, data: { status: 'ok' }, message: 'ok' }),
    ).toBe(true);
  });

  it('does not mistake a bare payload for an envelope', () => {
    // A payload that happens to have a `data` field but no `success` flag
    // is a payload — unwrapping it would lose a level of the response.
    expect(isEnvelope({ data: { status: 'ok' } })).toBe(false);
  });

  it('recognises the error envelope as an envelope too', () => {
    // `isEnvelope` answers "is this a wrapped body", not "is this a
    // success". A failed request never reaches this code — axios rejects
    // on a 4xx/5xx before the response is handed over — so the `success`
    // flag being `false` does not change what happens to the body.
    expect(
      isEnvelope({
        success: false,
        data: null,
        message: 'not_found',
        statusCode: 404,
      }),
    ).toBe(true);
  });

  it('rejects values that are not objects', () => {
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope(undefined)).toBe(false);
    expect(isEnvelope('ok')).toBe(false);
    expect(isEnvelope(42)).toBe(false);
  });
});

describe('axiosInstance', () => {
  it('unwraps one level of the envelope', async () => {
    const payload = { status: 'ok', service: 'api' };

    const result = await axiosInstance<HealthStatusDtoEnvelope>(
      { url: '/health', method: 'GET' },
      { adapter: adapterFor({ success: true, data: payload, message: 'ok' }) },
    );

    expect(result).toEqual(payload);
  });

  it('returns the payload, not the envelope', async () => {
    // The point of the whole unwrapping: the caller gets the payload.
    const result = await axiosInstance<HealthStatusDtoEnvelope>(
      { url: '/health', method: 'GET' },
      {
        adapter: adapterFor({
          success: true,
          data: { status: 'ok', service: 'api' },
          message: 'ok',
        }),
      },
    );

    expect(result).not.toHaveProperty('success');
    expect(result).not.toHaveProperty('message');
  });

  it('keeps a bare payload intact', async () => {
    // During a deploy the frontend can talk to a backend that does not
    // wrap its responses yet. A raw body must pass through unchanged.
    const result = await axiosInstance<HealthStatusDto>(
      { url: '/health', method: 'GET' },
      { adapter: adapterFor({ status: 'ok', service: 'api' }) },
    );

    expect(result).toEqual({ status: 'ok', service: 'api' });
  });

  it('rejects with the full error envelope, unwrapped in no way', async () => {
    // A failed request never reaches the unwrapping code: axios rejects
    // before the response is handed over, so the body keeps the fields the
    // error helpers read.
    const errorBody = {
      success: false,
      data: null,
      message: 'not_found',
      statusCode: 404,
      path: '/health',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    await expect(
      axiosInstance<HealthStatusDtoEnvelope>(
        { url: '/health', method: 'GET' },
        { adapter: adapterFor(errorBody, 404) },
      ),
    ).rejects.toMatchObject({ response: { data: errorBody } });
  });

  it('exposes the underlying instance so a caller can reach its defaults', () => {
    expect(AXIOS_INSTANCE.defaults.baseURL).toBeDefined();
  });

  it('decodes JSON errors from a download requested as a Blob', async () => {
    const errorBody = { success: false, data: null, message: 'conflict' };
    const blob = new Blob([JSON.stringify(errorBody)], {
      type: 'application/json',
    });
    const result = axiosInstance<Blob>(
      {
        url: '/output-files/test/download',
        method: 'GET',
        responseType: 'blob',
      },
      { adapter: adapterFor(blob, 409) },
    );
    await expect(result).rejects.toMatchObject({
      response: { data: errorBody },
    });
    expect(await result.catch(apiErrorCode)).toBe('conflict');
  });

  it('keeps binary success responses intact', async () => {
    const file = new Blob(['test file'], { type: 'application/octet-stream' });
    const result = await axiosInstance<Blob>(
      {
        url: '/output-files/test/download',
        method: 'GET',
        responseType: 'blob',
      },
      { adapter: adapterFor(file) },
    );
    expect(result).toBe(file);
  });
});

describe('the Unwrap type', () => {
  it('turns an envelope type into its payload type', () => {
    // The type-level half of the contract: the generated hook's
    // `query.data` is the payload, which is what the screens actually read.
    //
    // If `Unwrap` stopped unwrapping, `query.data.status` would not
    // compile — and every screen that reads it would fail the build.
    expectTypeOf<
      Unwrap<HealthStatusDtoEnvelope>
    >().toEqualTypeOf<HealthStatusDto>();
  });

  it('leaves a payload type alone', () => {
    expectTypeOf<Unwrap<HealthStatusDto>>().toEqualTypeOf<HealthStatusDto>();
  });
});
