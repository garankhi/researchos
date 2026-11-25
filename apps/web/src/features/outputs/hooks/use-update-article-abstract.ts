'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getOutputsControllerFindOneQueryKey,
  useOutputsControllerUpdateArticleAbstract,
} from '@/lib/api';
import type { OutputResponseDto } from '@/lib/api/models/outputResponseDto';

export function useUpdateArticleAbstract() {
  const queryClient = useQueryClient();
  const { mutateAsync } = useOutputsControllerUpdateArticleAbstract({
    mutation: {
      onSuccess: async (revision, { outputId, data }) => {
        const queryKey = getOutputsControllerFindOneQueryKey(outputId);
        await queryClient.cancelQueries({ queryKey, exact: true });
        queryClient.setQueryData<OutputResponseDto>(queryKey, (output) =>
          output?.currentReleaseId === data.expectedRevisionId
            ? {
                ...output,
                currentReleaseId: revision.id,
                currentRevision: revision,
              }
            : output,
        );
        void queryClient.invalidateQueries({
          queryKey,
          exact: true,
          refetchType: 'none',
        });
      },
    },
  });

  return (outputId: string, expectedRevisionId: string, abstract: string) =>
    mutateAsync({ outputId, data: { expectedRevisionId, abstract } });
}
