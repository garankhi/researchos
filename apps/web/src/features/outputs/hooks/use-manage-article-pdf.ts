import { useQueryClient } from '@tanstack/react-query';
import {
  getOutputsControllerFindFilesQueryKey,
  getOutputsControllerFindHomeFeedQueryKey,
  getOutputsControllerFindOneQueryKey,
  outputsControllerAttachArticlePdf,
  outputsControllerRemoveArticlePdf,
  outputsControllerUpdateArticlePdfVisibility,
} from '@/lib/api';
import type { AttachArticlePdfDto } from '@/lib/api/models/attachArticlePdfDto';
import type { UpdateArticlePdfVisibilityDtoFileVisibility } from '@/lib/api/models/updateArticlePdfVisibilityDtoFileVisibility';

export function useManageArticlePdf(outputId: string) {
  const queryClient = useQueryClient();

  async function refreshArticleFiles() {
    void queryClient.invalidateQueries({
      queryKey: getOutputsControllerFindHomeFeedQueryKey(),
    });
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getOutputsControllerFindOneQueryKey(outputId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: getOutputsControllerFindFilesQueryKey(outputId),
        exact: true,
      }),
    ]);
  }

  return {
    async attach(data: AttachArticlePdfDto) {
      await outputsControllerAttachArticlePdf(outputId, data);
      await refreshArticleFiles();
    },
    async changeVisibility(
      fileId: string,
      fileVisibility: UpdateArticlePdfVisibilityDtoFileVisibility,
    ) {
      await outputsControllerUpdateArticlePdfVisibility(outputId, fileId, {
        fileVisibility,
      });
      await refreshArticleFiles();
    },
    async remove(fileId: string) {
      await outputsControllerRemoveArticlePdf(outputId, fileId);
      await refreshArticleFiles();
    },
  };
}
