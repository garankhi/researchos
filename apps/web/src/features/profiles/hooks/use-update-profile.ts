'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getAuthControllerMeQueryKey,
  getProfilesControllerGetMyProfileQueryKey,
  useProfilesControllerUpdateMyProfile,
} from '@/lib/api';

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useProfilesControllerUpdateMyProfile({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getProfilesControllerGetMyProfileQueryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: getAuthControllerMeQueryKey(),
          }),
        ]);
      },
    },
  });
}
