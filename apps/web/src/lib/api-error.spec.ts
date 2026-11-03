import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import {
  apiErrorCode,
  apiFieldErrorCodes,
  apiFieldErrors,
  apiStatusCode,
} from './api-error';
import type { ApiErrorBody } from './api-error';

/**
 * The error helpers read the backend's error envelope.
 *
 * They exist so a component never has to reach into the axios error shape
 * itself. A failed request never reaches the typed client — axios rejects
 * with the raw response body — so these helpers are the only place that
 * knows where the code, the field errors and the status live.
 *
 * The failure mode they protect against is quiet: `String(error)` renders
 * "AxiosError: Request failed with status code 500" instead of the code
 * the server sent, and the user sees nothing actionable.
 */

/**
 * Builds an axios error carrying an error envelope, the way the backend
 * sends it.
 */
function axiosErrorWith(body: Partial<ApiErrorBody>, status = 400) {
  return new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    undefined,
    {
      data: body,
      status,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: {} },
    } as never,
  );
}

describe('apiErrorCode', () => {
  it('reads the code out of the envelope message', () => {
    const error = axiosErrorWith({ message: 'opportunity_not_found' });

    expect(apiErrorCode(error)).toBe('opportunity_not_found');
  });

  it('returns undefined for an error that is not an axios error', () => {
    expect(apiErrorCode(new Error('boom'))).toBeUndefined();
  });

  it('returns undefined when the response carries no body', () => {
    const error = new AxiosError(
      'Request failed with status code 500',
      AxiosError.ERR_BAD_REQUEST,
      undefined,
      undefined,
      { data: undefined, status: 500 } as never,
    );

    expect(apiErrorCode(error)).toBeUndefined();
  });
});

describe('apiFieldErrors', () => {
  it('returns the per-field errors array', () => {
    const errors = [
      { field: 'title', messages: ['title_required'] },
      { field: 'email', messages: ['email_invalid'] },
    ];

    const error = axiosErrorWith({ message: 'validation_failed', errors });

    expect(apiFieldErrors(error)).toEqual(errors);
  });

  it('returns undefined when the failure carries no field errors', () => {
    const error = axiosErrorWith({ message: 'not_found' });

    expect(apiFieldErrors(error)).toBeUndefined();
  });

  it('returns undefined for an error that is not an axios error', () => {
    expect(apiFieldErrors(new Error('boom'))).toBeUndefined();
  });
});

describe('apiFieldErrorCodes', () => {
  it('groups the codes by the field they belong to', () => {
    const error = axiosErrorWith({
      message: 'validation_failed',
      errors: [
        { field: 'title', messages: ['title_required'] },
        { field: 'email', messages: ['email_invalid'] },
      ],
    });

    expect(apiFieldErrorCodes(error)).toEqual({
      title: ['title_required'],
      email: ['email_invalid'],
    });
  });

  it('keeps every code that failed on the same field', () => {
    // Several constraints can fail on one field, and each one is a code
    // the catalog resolves — so none of them may be dropped.
    const error = axiosErrorWith({
      message: 'validation_failed',
      errors: [
        { field: 'title', messages: ['title_required'] },
        { field: 'title', messages: ['title_invalid'] },
      ],
    });

    expect(apiFieldErrorCodes(error)).toEqual({
      title: ['title_required', 'title_invalid'],
    });
  });

  it('returns undefined when there are no field errors', () => {
    const error = axiosErrorWith({ message: 'not_found' });

    expect(apiFieldErrorCodes(error)).toBeUndefined();
  });

  it('returns undefined for an error that is not an axios error', () => {
    expect(apiFieldErrorCodes(new Error('boom'))).toBeUndefined();
  });
});

describe('apiStatusCode', () => {
  it('returns the HTTP status', () => {
    const error = axiosErrorWith({ message: 'not_found' }, 404);

    expect(apiStatusCode(error)).toBe(404);
  });

  it('returns undefined for an error that is not an axios error', () => {
    expect(apiStatusCode(new Error('boom'))).toBeUndefined();
  });
});
