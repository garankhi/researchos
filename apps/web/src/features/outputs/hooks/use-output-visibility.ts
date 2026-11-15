'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useOutputsControllerUpdateVisibility } from '@/lib/api';
import type { UpdateOutputVisibilityDto } from '@/lib/api/models';

/**
 * Visibility edit for a work.
 *
 * The Orval hook is the transport layer; this hook adds the cache
 * invalidation so the profile list and the detail page both refresh after
 * a change. The caller owns the feedback: success goes to the snackbar,
 * failure stays inline next to the control that failed.
 */
export function useOutputVisibility() {
  const queryClient = useQueryClient();

  const mutation = useOutputsControllerUpdateVisibility({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          predicate: (query) =>
            typeof query.queryKey[0] === 'string' &&
            query.queryKey[0].startsWith('/outputs'),
        });
      },
    },
  });

  return {
    updateVisibility: (outputId: string, data: UpdateOutputVisibilityDto) =>
      mutation.mutateAsync({ outputId, data }),
    isPending: mutation.isPending,
    variables: mutation.variables,
  };
}
