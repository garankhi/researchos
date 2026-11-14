'use client';

import {
  useProfilesControllerGetMyProfile,
  useProfilesControllerGetProfileById,
} from '@/lib/api';
import { apiStatusCode } from '@/lib/api-error';
import type { ProfileResponseDto } from '../types';

export function useProfile({
  userId,
  isOwner = false,
}: {
  userId?: string;
  isOwner?: boolean;
}) {
  const myProfileQuery = useProfilesControllerGetMyProfile({
    query: {
      enabled: isOwner,
      staleTime: 60 * 1000,
    },
  });

  const publicProfileQuery = useProfilesControllerGetProfileById(userId ?? '', {
    query: {
      enabled: !isOwner && Boolean(userId),
      staleTime: 60 * 1000,
    },
  });

  const activeQuery = isOwner ? myProfileQuery : publicProfileQuery;

  const data: ProfileResponseDto | undefined = activeQuery.data;
  const isLoading = activeQuery.isPending && activeQuery.fetchStatus !== 'idle';
  const isFetching = activeQuery.isFetching;
  const isFailed = activeQuery.isError;
  const statusCode = activeQuery.error
    ? apiStatusCode(activeQuery.error)
    : null;
  const isForbidden = statusCode === 403;
  const isNotFound = statusCode === 404;

  /**
   * Whether the request succeeded but carried no profile.
   *
   * This is **not** the same as a failure. A failure means the request
   * never produced an answer — the API is down, the session expired — and
   * it has to be shown as an error the reader can retry. An answer that
   * simply says "this researcher has no profile yet" is a valid, empty
   * state.
   *
   * The distinction is why `isFailed` is checked first by the screen: a
   * failed request must never be rendered as "not found", or a transient
   * failure would read as a fact about the researcher.
   */
  const isEmpty = !isFailed && !isLoading && data === undefined;

  return {
    profile: data,
    isLoading,
    isFetching,
    isFailed,
    isForbidden,
    isNotFound,
    isEmpty,
    error: activeQuery.error,
    refetch: activeQuery.refetch,
  };
}
