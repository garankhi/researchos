'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getAuthControllerMeQueryKey,
  getProfilesControllerGetMyProfileQueryKey,
  getProfilesControllerGetProfileByIdQueryKey,
  useProfilesControllerUpdateMyProfile,
} from '@/lib/api';

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useProfilesControllerUpdateMyProfile({
    mutation: {
      onSuccess: async (updatedProfile) => {
        queryClient.setQueryData(
          getProfilesControllerGetMyProfileQueryKey(),
          updatedProfile,
        );
        if (updatedProfile?.userId) {
          queryClient.setQueryData(
            getProfilesControllerGetProfileByIdQueryKey(updatedProfile.userId),
            updatedProfile,
          );
        }
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getProfilesControllerGetMyProfileQueryKey(),
          }),
          updatedProfile?.userId
            ? queryClient.invalidateQueries({
                queryKey: getProfilesControllerGetProfileByIdQueryKey(
                  updatedProfile.userId,
                ),
              })
            : Promise.resolve(),
          queryClient.invalidateQueries({
            queryKey: getAuthControllerMeQueryKey(),
          }),
        ]);
      },
    },
  });
}
