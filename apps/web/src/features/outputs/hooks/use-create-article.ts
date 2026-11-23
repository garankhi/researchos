import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getOutputsControllerFindAllQueryKey,
  getOutputsControllerFindHomeFeedQueryKey,
  useOutputsControllerCreateArticle,
} from '@/lib/api';
import type { CreateArticleDto } from '@/lib/api/models/createArticleDto';

export function useCreateArticle() {
  const queryClient = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const pending = useRef(false);
  const mutation = useOutputsControllerCreateArticle();

  async function create(data: CreateArticleDto) {
    if (pending.current) return;
    pending.current = true;
    const submission = JSON.stringify(data);
    const key = keys.current.get(submission) ?? crypto.randomUUID();
    keys.current.set(submission, key);
    try {
      const article = await mutation.mutateAsync({
        data,
        headers: { 'idempotency-key': key },
      });
      void queryClient.invalidateQueries({
        queryKey: getOutputsControllerFindHomeFeedQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: getOutputsControllerFindAllQueryKey(),
      });
      return article;
    } finally {
      pending.current = false;
    }
  }

  return { create, isPending: mutation.isPending };
}
