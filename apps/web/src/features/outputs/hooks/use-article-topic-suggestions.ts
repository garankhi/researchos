import { useQuery } from '@tanstack/react-query';
import {
  topicSuggestionsControllerGet,
  topicSuggestionsControllerRequest,
} from '@/lib/api';

async function wait(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve) => {
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
  signal.throwIfAborted();
}

export function useArticleTopicSuggestions(
  context: { userId: string; title: string } | undefined,
  value: string,
  delayMs: number,
) {
  const title = context?.title.trim() ?? '';
  const abstract = value.trim();
  const enabled = Boolean(context?.userId && title && abstract.length <= 20000);
  const query = useQuery({
    queryKey: ['article-topic-suggestions', context?.userId, title, abstract],
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      if (delayMs > 0) await wait(delayMs, signal);
      const requestSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(20_000),
      ]);
      const { requestId } = await topicSuggestionsControllerRequest(
        { title, abstract: abstract || undefined },
        undefined,
        requestSignal,
      );
      while (true) {
        const result = await topicSuggestionsControllerGet(
          requestId,
          undefined,
          requestSignal,
        );
        if (result.status !== 'pending') return result;
        await wait(1000, requestSignal);
      }
    },
  });

  return {
    items:
      enabled && query.data?.status === 'ready'
        ? query.data.suggestions
            .slice(0, 5)
            .map(({ topicId, name }) => ({ id: topicId, name }))
        : [],
    loading: enabled && query.isFetching,
    unavailable:
      enabled && (query.isError || query.data?.status === 'unavailable'),
  };
}
