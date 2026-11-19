'use client';

import { useAuthControllerMe } from '@/lib/api';

export function useChatCurrentUser() {
  const query = useAuthControllerMe({
    query: {
      staleTime: 60_000,
    },
  });

  return {
    currentUser: query.data ?? null,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
  };
}
