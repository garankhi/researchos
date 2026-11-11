/**
 * The domain error codes, grouped by the module that owns them.
 *
 * A **domain code** names a specific failure that the generic status
 * cannot describe: `opportunity_not_found` says more than `not_found`.
 * A module raises one when it knows better than the status does, using
 * `CodedHttpException` on the API side.
 *
 * ## Why the registry lives here
 *
 * The catalog check needs the list of codes the backend can emit, and the
 * backend needs the codes themselves. Keeping them in one package means
 * both sides read one source of truth, so the list cannot drift and
 * neither package has to reach into the other's folder.
 *
 * The frontend's `errors.codes.domain.*` catalog tier is checked against
 * this registry, so a code that is registered but has no catalog entry —
 * in either locale — fails the web app's test run instead of degrading
 * silently into a wrong-but-plausible message at runtime.
 *
 * ## Adding a code
 *
 * Three places change together, in the same commit:
 *
 * 1. This registry — the module's entry gains the code.
 * 2. `apps/web/src/messages/en.json` — under `errors.codes.domain`.
 * 3. `apps/web/src/messages/vi.json` — under `errors.codes.domain`.
 *
 * The API then raises the code by reading it off the registry, so the
 * constant that goes on the wire and the constant the catalog is checked
 * against are the same value.
 *
 * ```ts
 * export const domainErrorCodes = {
 *   opportunities: {
 *     notFound: 'opportunity_not_found',
 *   },
 * } as const satisfies DomainCodeMap;
 * ```
 *
 * Reading the code off the registry also makes the compiler help: the
 * code is typed as the registry's literal union, so a module that raises
 * a code it never registered does not compile.
 */

/**
 * The shape of the registry.
 *
 * The outer key is the module — the API's module folder — and the inner
 * key is a short name for the failure. The value is the code that goes
 * on the wire.
 */
export type DomainCodeMap = Record<string, Record<string, string>>;

/**
 * The domain codes, grouped by the module that owns them.
 *
 * This is the registry the frontend's catalog check reads, so it must
 * list every code the backend can emit as a domain code.
 *
 * `as const` is what keeps each code a literal type rather than `string`.
 * Without it, `DomainErrorCode` would widen to `string` and an
 * unregistered code would compile — which is the one thing this registry
 * exists to prevent.
 */
export const domainErrorCodes = {
  follows: {
    selfFollow: 'follow_self',
    targetTypeUnsupported: 'follow_target_type_unsupported',
  },
  groups: {
    groupNotFound: 'group_not_found',
    groupCodeAlreadyExists: 'group_code_already_exists',
    groupLeaderIneligible: 'group_leader_ineligible',
  },
  identity: {
    invalidCredentials: 'invalid_credentials',
    accountInactive: 'account_inactive',
    mustChangePassword: 'must_change_password',
    passwordUnchanged: 'password_unchanged',
    userNotFound: 'user_not_found',
    userAlreadyExists: 'user_already_exists',
    emailAlreadyRegistered: 'email_already_registered',
    cannotGrantSelfRole: 'cannot_grant_self_role',
    cannotRemoveLastAdmin: 'cannot_remove_last_admin',
    invalidRoleRevocation: 'invalid_role_revocation',
    roleAlreadyGranted: 'role_already_granted',
    roleNotGranted: 'role_not_granted',
  },
  opportunities: {
    notFound: 'opportunity_not_found',
  },
  profiles: {
    profileNotFound: 'profile_not_found',
  },
  provenance: {
    fieldLocked: 'provenance_field_locked',
    humanSourceNotAllowed: 'provenance_human_source_not_allowed',
    unkCannotVerify: 'provenance_unk_cannot_verify',
    autoVerifyNotAllowed: 'provenance_auto_verify_not_allowed',
  },
  openalex: {
    authorNotFound: 'openalex_author_not_found',
    workNotFound: 'openalex_work_not_found',
    serviceUnavailable: 'openalex_unavailable',
  },
  taxonomy: {
    fieldNotFound: 'field_not_found',
    topicNotFound: 'topic_not_found',
  },
} as const satisfies DomainCodeMap;

/**
 * The code values the registry holds, as a literal union.
 *
 * This is what makes an unregistered code a **compile error** rather than
 * a runtime surprise: `CodedHttpException` accepts only these values, so
 * a module cannot raise a code the registry does not list.
 *
 * The conditional distributes over the registry's modules, and each
 * module's codes are read as literals rather than widened to `string`.
 * While the registry is empty the union is `never`, so a domain code
 * cannot be raised at all — which is correct, because there is none.
 */
export type DomainErrorCode =
  (typeof domainErrorCodes)[keyof typeof domainErrorCodes] extends infer M
    ? M extends Record<string, infer C>
      ? C extends string
        ? C
        : never
      : never
    : never;

/**
 * Every registered domain code, flattened.
 *
 * This is the list the frontend's catalog check compares against: every
 * code in here needs an entry under `errors.codes.domain` in **both**
 * locales.
 */
export const domainErrorCodeList: string[] = Object.values(domainErrorCodes).flatMap(
  (codes) => Object.values(codes),
);

/**
 * True when the code is a registered domain code.
 *
 * The frontend's catalog check uses this to spot a code that sits in the
 * catalog but was never registered — usually a leftover from a renamed
 * code, or a code added to the catalog without adding it here.
 */
export function isDomainErrorCode(code: string): boolean {
  return domainErrorCodeList.includes(code);
}
