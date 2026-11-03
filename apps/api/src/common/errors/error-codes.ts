/**
 * The API's error-code primitives.
 *
 * A code is a machine-readable identifier, never an English sentence. The
 * frontend resolves it against the `errors.codes` namespace of the message
 * catalog, so a user never sees the server's English. See the
 * `researchos-localization` skill.
 *
 * Two kinds of code exist, and they live in two different places:
 *
 * - A **generic code**, derived from the HTTP status (`not_found`,
 *   `validation_failed`). The set is fixed in `@researchos/error-codes` —
 *   it is a platform contract, and it does not grow.
 * - A **domain code**, specific to what failed (`opportunity_not_found`).
 *   A module raises one when it knows better than the status. Each module
 *   defines its own codes and adds the matching catalog entries in both
 *   locales in the same change.
 *
 * The generic codes live in their own package, without a NestJS
 * dependency, so that the web app's catalog check can read the same list
 * the API emits.
 */

import { HttpException, HttpStatus } from '@nestjs/common';

export { codeForStatus, genericErrorCodeList, genericErrorCodes } from '@researchos/error-codes';

/**
 * An HTTP failure that carries a specific error code.
 *
 * The generic status code says what kind of failure it was; the code says
 * which one. A missing opportunity is a 404, but `opportunity_not_found`
 * says more than `not_found` — it names the thing that was missing.
 *
 * The code travels in the envelope's `message` field, and it is also this
 * exception's `message` — Nest's `HttpException` reads it from the
 * response body, so the filter can read it from either place and they can
 * never disagree.
 *
 * The wording lives in the frontend's message catalog, so it is added
 * there in the same change that introduces the code.
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
