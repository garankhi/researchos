'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  useAuthControllerLogout,
  getAuthControllerMeQueryKey,
} from '@/lib/api';

/**
 * Feature hook for the logout.
 *
 * The logout revokes the session behind the cookie and clears it. The
 * `GET /me` query is removed from the cache rather than invalidated: a
 * refetch would ask the API for a session that is already gone, and the
 * answer would be a `401` the screen has to interpret.
 */
export function useLogout() {
  const queryClient = useQueryClient();

  const mutation = useAuthControllerLogout({
    mutation: {
      onSettled: () => {
        queryClient.removeQueries({ queryKey: getAuthControllerMeQueryKey() });
      },
    },
  });

  return mutation;
}
