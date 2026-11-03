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
 * A machine-readable backend error identifier, e.g. `opportunity_not_found`.
 *
 * Both `message` and `errors[].messages` carry codes, not sentences, so
 * the frontend can resolve them against the message catalog. See the
 * `researchos-localization` skill.
 */
export type ErrorCode = string;

/**
 * Reads the top-level error code out of a failed request.
 *
 * `message` carries the code for the whole failure
 * (`opportunity_not_found`, `validation_failed`, ...).
 *
 * The backend returns the error envelope, and axios rejects with the whole
 * response body intact — the mutator only unwraps successful responses. So
 * the server's code lives at `error.response.data.message`.
 *
 * Without this helper a component would have to reach into the axios error
 * shape itself, and `String(error)` would render
 * "AxiosError: Request failed with status code 500" instead of the code
 * the server actually sent.
 *
 * This value is a *code*, not display text. Resolve it with
 * `resolveErrorCode()` from `@/utils/error-messages` before showing it to
 * a user — a raw code must never reach the screen.
 */
export function apiErrorCode(error: unknown): ErrorCode | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const body = error.response?.data as ApiErrorBody | undefined;

  return body?.message || undefined;
}

/**
 * Returns the field-level validation errors of a failed request, if any.
 *
 * The backend groups validation messages by field so a form can show each
 * message next to the input that caused it.
 */
export function apiFieldErrors(error: unknown): ApiErrorBody['errors'] {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const body = error.response?.data as ApiErrorBody | undefined;

  return body?.errors;
}

/**
 * Reads the field-level validation codes out of a failed request, grouped
 * by the field they belong to.
 *
 * Each entry is one code per constraint that failed on that field
 * (`title_required`, `title_invalid`, ...).
 */
export function apiFieldErrorCodes(
  error: unknown,
): Record<string, ErrorCode[]> | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const body = error.response?.data as ApiErrorBody | undefined;

  if (!body?.errors?.length) {
    return undefined;
  }

  const grouped: Record<string, ErrorCode[]> = {};

  for (const entry of body.errors) {
    grouped[entry.field] = [...(grouped[entry.field] ?? []), ...entry.messages];
  }

  return grouped;
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
