import axios from 'axios';
import type { ApiErrorResponseDto } from '@/lib/api/models';

/**
 * The body the API returns for a failed request.
 *
 * This is the type the backend generates from the error envelope
 * (`ApiErrorResponseDto` in `apps/api/src/common/dto/api-response.dto.ts`).
 * It is imported as a type only: a failed request never reaches the typed
 * client — axios rejects with the raw response body — but the type still
 * keeps the frontend's view of the error contract in sync with the spec
 * instead of duplicating the shape by hand.
 */
export type ApiErrorBody = ApiErrorResponseDto;

/**
 * Extracts a human readable message from a failed API request.
 *
 * The backend returns the error envelope, and axios rejects with the whole
 * response body intact — the mutator only unwraps successful responses. So
 * the server's message lives at `error.response.data.message`.
 *
 * Without this helper a component would have to reach into the axios error
 * shape itself, and `String(error)` would render
 * "AxiosError: Request failed with status code 500" instead of the message
 * the server actually sent.
 */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;

    if (body?.message) {
      return body.message;
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Đã xảy ra lỗi không xác định.';
}

/**
 * Returns the field-level validation errors of a failed request, if any.
 *
 * The backend groups validation messages by field so a form can show each
 * message next to the input that caused it.
 */
export function apiFieldErrors(
  error: unknown,
): ApiErrorBody['errors'] {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const body = error.response?.data as ApiErrorBody | undefined;

  return body?.errors;
}

/**
 * Returns the HTTP status code of a failed request, if any.
 */
export function apiStatusCode(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  return error.response?.status;
}
