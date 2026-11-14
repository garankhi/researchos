'use client';

import { useMe } from './use-me';
import { useSessionStore } from '../store/session-store';
import type { CurrentUser } from '../types';

/**
 * The session, as the chrome needs to see it.
 *
 * The header and the account menu have to answer one question on their
 * very first render: "is somebody signed in?". This hook answers it, and
 * it answers it with three explicit states rather than a nullable account:
 *
 * - `isChecking` — the answer is not in yet;
 * - `isSignedIn` — there is an account, and its name is known;
 * - `isSignedOut` — there is no session.
 *
 * The distinction between the first and the last matters: a header that
 * shows "Sign in" to a signed-in user for a moment is showing something
 * untrue, so the chrome waits instead.
 *
 * The `GET /me` request is deduplicated by TanStack Query, so the header
 * asking for the session costs nothing extra on a page that already
 * asks for it.
 */
export function useSession() {
  const { isFetching, isFailed, refetch } = useMe();

  const user = useSessionStore((state) => state.user);
  const isResolved = useSessionStore((state) => state.isResolved);

  return {
    /** The signed-in account, or `null`. */
    user,
    /** There is an account and its name is known. */
    isSignedIn: user !== null,
    /** The session has been checked and nobody is signed in. */
    isSignedOut: isResolved && user === null,
    /**
     * The session is still being checked.
     *
     * A failed request counts as checked: the API is down, and waiting
     * forever for an answer that is not coming would leave the header
     * blank on every page.
     *
     * The check is `isResolved` rather than `isFetching` on purpose. A
     * query that has just mounted has not started fetching yet — the
     * request begins in an effect — so `isFetching` is `false` on the
     * very first render, and the header would flash the sign-in link at
     * a user who is signed in.
     */
    isChecking: !isResolved && !isFailed,
    /** A request is in flight. */
    isFetching,
    /** The last attempt failed for a reason other than "not signed in". */
    isFailed,
    /**
     * Checks the session again.
     *
     * A guard needs this: when the check fails because the API was
     * unreachable, the visitor has to be able to ask again once it is
     * back. The `GET /me` request is deduplicated by TanStack Query, so
     * calling this while a request is already in flight is cheap.
     */
    refetch,
  };
}

/**
 * The signed-in account, read straight from the store.
 */
export function useCurrentUser(): CurrentUser | null {
  return useSessionStore((state) => state.user);
}
