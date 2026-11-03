'use client';

import { useAuthControllerMe } from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import { toCurrentUser } from '../types';
import type { CurrentUser } from '../types';

/**
 * Feature hook for the current session.
 *
 * The Orval hook (`useAuthControllerMe`) is the transport layer: it owns
 * the request, the cache key and the query lifecycle. This hook is the
 * domain layer — it maps the generated DTO onto `CurrentUser` and
 * normalises the states a screen actually has to render.
 *
 * ## Why "signed out" is not a failure
 *
 * `GET /me` answers `401` when there is no valid session behind the
 * request. That is an expected state, not a broken request: the user is
 * simply not signed in. The hook therefore reports it as `isSignedOut`
 * and keeps `isFailed` for the failures that actually need a retry.
 *
 * The query does not retry either: a `401` will still be a `401` on the
 * second attempt, and retrying it only delays the answer the screen is
 * waiting for.
 */
export function useMe() {
  const query = useAuthControllerMe({
    query: { retry: false },
  });

  const data: CurrentUser | undefined = query.data
    ? toCurrentUser(query.data)
    : undefined;

  const isSignedOut = query.isError && apiStatusCode(query.error) === 401;

  return {
    ...query,
    data,
    /** The API answered and the payload is usable. */
    isLoaded: query.isSuccess && data !== undefined,
    /** A request is currently in flight. */
    isFetching: query.isFetching,
    /** The last attempt failed for a reason other than "not signed in". */
    isFailed: query.isError && !isSignedOut,
    /** There is no valid session behind the request. */
    isSignedOut,
  };
}
