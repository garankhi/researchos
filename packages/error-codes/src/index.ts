/**
 * The generic error codes the ResearchOS API can emit.
 *
 * A code is a machine-readable identifier, never an English sentence. The
 * frontend resolves it against the `errors.codes` namespace of the message
 * catalog, so a user never sees the server's English. See the
 * `researchos-localization` skill.
 *
 * Two kinds of code exist, and they live in two different places:
 *
 * - A **generic code**, derived from the HTTP status (`not_found`,
 *   `validation_failed`). The set is fixed here — it is a platform
 *   contract, and it does not grow.
 * - A **domain code**, specific to what failed (`opportunity_not_found`).
 *   A module raises one when it knows better than the status. Each module
 *   defines its own codes and adds the matching catalog entries in both
 *   locales in the same change.
 *
 * The frontend catalog mirrors this split: `errors.codes.*` holds the
 * generic codes, `errors.codes.fields.*` the validation constraints and
 * `errors.codes.domain.*` the domain ones.
 *
 * ## Why this lives in a package
 *
 * The generic codes are a contract between the two sides of the wire: the
 * API emits them, the web app resolves them against its catalog. Keeping
 * the list in one place lets both sides import it, so the list cannot drift
 * and neither package has to reach into the other's folder.
 *
 * This module deliberately has **no dependency on NestJS**. The API maps
 * HTTP statuses onto these codes, but the mapping itself is plain data, and
 * the web app has no reason to pull a server framework in to read it.
 */

/**
 * The generic code for each HTTP status.
 *
 * The frontend catalog has an entry for each of these, so a failure that
 * carries no more specific code still resolves to a localized message
 * instead of falling back to a raw identifier.
 *
 * The keys are the HTTP status numbers, spelled out rather than imported
 * from `@nestjs/common` so that this module stays framework-free.
 */
export const genericErrorCodes = {
  400: 'validation_failed',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'validation_failed',
  429: 'rate_limited',
  501: 'not_implemented',
  503: 'service_unavailable',
  500: 'server_error',
} as const satisfies Record<number, string>;

/**
 * The distinct generic codes, in the order they are listed above.
 *
 * Two statuses can share a code (`400` and `422` are both
 * `validation_failed`), so this is the set of *distinct* codes — which is
 * what the catalog has to cover.
 */
export const genericErrorCodeList: string[] = [
  ...new Set(Object.values(genericErrorCodes)),
];

/**
 * The code for a failure that has no more specific code.
 *
 * The mapping is total: every status resolves to a code, so the frontend
 * always has a key to look up.
 */
export function codeForStatus(status: number): string {
  const code = (genericErrorCodes as Record<number, string | undefined>)[status];

  return code ?? 'server_error';
}
