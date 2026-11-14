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

  return {
    profile: data,
    isLoading,
    isFetching,
    isFailed,
    isForbidden,
    isNotFound,
    error: activeQuery.error,
    refetch: activeQuery.refetch,
  };
}
