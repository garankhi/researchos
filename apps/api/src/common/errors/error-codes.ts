/**
 * The error codes the API can emit.
 *
 * A code is a machine-readable identifier, never an English sentence. The
 * frontend resolves it against the `errors.codes` namespace of the message
 * catalog, so a user never sees the server's English. See the
 * `researchos-localization` skill.
 *
 * Two kinds of code exist:
 *
 * - A **generic code**, derived from the HTTP status. Every failure has one,
 *   so the frontend always has a key to resolve even when nothing more
 *   specific is known.
 * - A **domain code**, specific to what failed (`opportunity_not_found`).
 *   A module raises one when it knows better than the status.
 *
 * The generic set is fixed here. The domain codes are **not** — each module
 * defines the codes it can emit, and adds the matching catalog entries in
 * both locales in the same change.
 */

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The generic code for each HTTP status.
 *
 * The frontend catalog has an entry for each of these, so a failure that
 * carries no more specific code still resolves to a localized message
 * instead of falling back to a raw identifier.
 */
const STATUS_CODES: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'validation_failed',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'validation_failed',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
  [HttpStatus.NOT_IMPLEMENTED]: 'not_implemented',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'server_error',
};

/**
 * The code for a failure that has no more specific code.
 *
 * The mapping is total: every status resolves to a code, so the frontend
 * always has a key to look up.
 */
export function codeForStatus(status: number): string {
  return STATUS_CODES[status as HttpStatus] ?? 'server_error';
}

/**
 * An HTTP failure that carries a specific error code.
 *
 * The generic status code says what kind of failure it was; the code says
 * which one. A missing opportunity is a 404, but `opportunity_not_found`
 * says more than `not_found` — it names the thing that was missing.
 *
 * The code travels in the envelope's `message` field. The wording lives in
 * the frontend's message catalog, so it is added there in the same change
 * that introduces the code.
 *
 * A code is a contract: renaming one breaks every translation that
 * references it. Add a new code instead of repurposing an old one.
 *
 * ```typescript
 * throw new CodedHttpException('opportunity_not_found', HttpStatus.NOT_FOUND);
 * ```
 */
export class CodedHttpException extends HttpException {
  constructor(
    readonly code: string,
    status: HttpStatus,
  ) {
    super({ message: code, statusCode: status }, status);
  }
}
