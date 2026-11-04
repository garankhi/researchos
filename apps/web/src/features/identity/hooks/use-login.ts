'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useAuthControllerLogin, getAuthControllerMeQueryKey } from '@/lib/api';
import { toCurrentUser } from '../types';
import { useSessionStore } from '../store/session-store';
import type { CurrentUser, LoginCredentials } from '../types';

/**
 * Feature hook for the local login.
 *
 * The Orval mutation (`useAuthControllerLogin`) is the transport layer. This
 * hook is the domain layer: it takes the credentials the form holds, keeps
 * the session cache in step with the new state, and normalises the payload
 * onto `CurrentUser`.
 *
 * ## Why the variables are reshaped
 *
 * Orval generates the mutation with the request body wrapped in a `data`
 * property, so the transport layer's variable is `{ data: LoginDto }`. The
 * form holds plain credentials, so the wrapper adapts them here rather than
 * making every caller remember the generated shape.
 *
 * ## Why the cache is written instead of refetched
 *
 * The login response already carries the signed-in account, so the
 * `GET /me` query is *set* rather than invalidated. That saves a round
 * trip and — more importantly — removes the window in which the screen
 * still shows the signed-out state right after a successful login.
 *
 * The **generated** payload is what goes into the cache, because that is
 * what `useMe` reads and maps. The domain type is a read model, not
 * something the query cache holds.
 *
 * ## Why the store is written too
 *
 * The query cache is empty on a hard reload, so a component that reads it
 * renders "signed out" first. The session store is written as soon as the
 * login response arrives, so the header and the account menu already know
 * the name and the roles when the redirect lands.
 */
export function useLogin() {
  const queryClient = useQueryClient();
  const setUser = useSessionStore((state) => state.setUser);

  const mutation = useAuthControllerLogin({
    mutation: {
      onSuccess: (payload) => {
        queryClient.setQueryData(getAuthControllerMeQueryKey(), payload);
        setUser(toCurrentUser(payload));
      },
    },
  });

  return {
    ...mutation,
    /** Fires the login with the credentials the form holds. */
    mutate: (
      credentials: LoginCredentials,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => mutation.mutate({ data: credentials }, options),
    /** Fires the login and waits for the answer. */
    mutateAsync: (
      credentials: LoginCredentials,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) => mutation.mutateAsync({ data: credentials }, options),
    /** The signed-in account, once the login has succeeded. */
    data: mutation.data ? toCurrentUser(mutation.data) : undefined,
  };
}

/**
 * The account a successful login returns.
 */
export type SignedInUser = CurrentUser;
