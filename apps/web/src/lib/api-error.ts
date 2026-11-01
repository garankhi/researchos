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
 * In the target contract both `message` and `errors[].messages` carry
 * codes, not sentences, so the frontend can resolve them against the
 * message catalog. The backend does not fully implement this yet — today
 * `message` holds English prose and the validation pipe reports validator
 * prose — so these helpers return whatever the server sent and the caller
 * resolves it with a fallback. See the `researchos-localization` skill.
 */
export type ErrorCode = string;

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
 *
 * In the target contract this value is a *code*, not a sentence. Resolve it
 * with `resolveErrorCode()` from `@/utils/error-messages` before showing it
 * to a user — this raw value is a fallback source, not display text.
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

  // Not a literal: the caller resolves this through the catalog, and a
  // hardcoded string here would be one language forever.
  return 'unknown_error';
}

/**
 * Reads the top-level error code out of a failed request.
 *
 * `message` carries the code for the whole failure
 * (`opportunity_not_found`, `validation_failed`, ...).
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
