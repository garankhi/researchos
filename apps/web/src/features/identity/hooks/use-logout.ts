'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  useAuthControllerLogout,
  getAuthControllerMeQueryKey,
} from '@/lib/api';
import { useSessionStore } from '../store/session-store';

/**
 * Feature hook for the logout.
 *
 * The logout revokes the session behind the cookie and clears it. The
 * `GET /me` query is removed from the cache rather than invalidated: a
 * refetch would ask the API for a session that is already gone, and the
 * answer would be a `401` the screen has to interpret.
 *
 * The session store is cleared as well. It holds the account the header
 * renders, so leaving it behind would show a signed-in name on a screen
 * that is no longer signed in.
 *
 * ## Why the clearing happens in `onSettled` and not in `onSuccess`
 *
 * The cleanup has to run whatever the answer was, so it belongs in
 * `onSettled`. But `onSettled` is a **hook-level** callback, and that
 * is exactly why it is safe: TanStack Query runs the hook-level
 * callbacks before it notifies the observer, so the cleanup happens
 * while the caller is still subscribed.
 *
 * The per-call callbacks a caller passes to `mutate()` are a different
 * story. TanStack Query only runs them if the observer still has
 * listeners — and clearing the session store unmounts the component
 * that owns the observer, which unsubscribes it. A per-call `onSuccess`
 * would therefore never fire, and the redirect that belongs in it would
 * silently never happen.
 *
 * So: the **cleanup** is a hook-level concern and lives here, and the
 * **navigation** is passed in by the caller, which runs it from a place
 * that is not tied to the lifetime of this component.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const clearUser = useSessionStore((state) => state.clearUser);

  const mutation = useAuthControllerLogout({
    mutation: {
      onSettled: () => {
        queryClient.removeQueries({ queryKey: getAuthControllerMeQueryKey() });
        clearUser();
      },
    },
  });

  return mutation;
}
