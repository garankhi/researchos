import { useQueryClient } from '@tanstack/react-query';
import {
  getOutputsControllerFindAllQueryKey,
  getOutputsControllerFindHomeFeedQueryKey,
  getOutputsControllerFindOneQueryKey,
  useOutputsControllerUpdateArticle,
} from '@/lib/api';
import type { OutputResponseDto } from '@/lib/api/models/outputResponseDto';

export function useUpdateArticle() {
  const queryClient = useQueryClient();
  return useOutputsControllerUpdateArticle({
    mutation: {
      onSuccess: async (article, { outputId, data }) => {
        const queryKey = getOutputsControllerFindOneQueryKey(outputId);
        await queryClient.cancelQueries({ queryKey, exact: true });
        queryClient.setQueryData<OutputResponseDto>(queryKey, (current) =>
          !current || current.currentReleaseId === data.expectedRevisionId
            ? article
            : current,
        );
        void queryClient.invalidateQueries({
          queryKey,
          exact: true,
          refetchType: 'none',
        });
        void queryClient.invalidateQueries({
          queryKey: getOutputsControllerFindAllQueryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: getOutputsControllerFindHomeFeedQueryKey(),
        });
      },
    },
  });
}
