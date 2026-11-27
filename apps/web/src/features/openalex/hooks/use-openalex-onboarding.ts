'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getOpenAlexControllerFindAllQueryKey,
  useOpenAlexControllerFindAll,
  useOpenAlexControllerFindAuthors,
  useOpenAlexControllerFindAvailableWorks,
  useOpenAlexControllerPullWorks,
} from '@/lib/api';
import type { CandidateWorkDto } from '@/features/profiles';

/**
 * The onboarding pull, in two steps.
 *
 * The researcher arrives with nothing but a name and an email — no
 * profile, no OpenAlex id, no ORCID. The platform has to find them
 * anyway, so it searches OpenAlex by name plus the hard-coded FPT
 * University affiliation and offers the candidates.
 *
 * Step 1 — the author. The researcher ticks the one that is theirs, or
 * skips. Confirming it records the OpenAlex author id on the profile,
 * so every later pull resolves through it. Skipping leaves the profile
 * without an id, and the name fallback keeps working.
 *
 * Step 2 — the works. The pull writes the works as candidates, and the
 * researcher accepts (publicly or privately) or rejects each one.
 */
export function useOpenAlexOnboarding({
  step,
  authorId,
  enabled = true,
}: {
  /** Which step the flow is on. */
  step: 'author' | 'works';
  /** The OpenAlex author the researcher confirmed, if any. */
  authorId?: string;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();

  const authorsQuery = useOpenAlexControllerFindAuthors({
    query: {
      enabled: enabled && step === 'author',
      staleTime: 5 * 60 * 1000,
    },
  });

  const availableWorksQuery = useOpenAlexControllerFindAvailableWorks(
    authorId ? { authorId } : {},
    {
      query: {
        enabled: enabled && step === 'works',
        staleTime: 60 * 1000,
      },
    },
  );

  const pullMutation = useOpenAlexControllerPullWorks({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: getOpenAlexControllerFindAllQueryKey({
            page: 1,
            limit: 20,
          }),
        });
      },
    },
  });

  const authors = authorsQuery.data?.authors ?? [];
  const availableWorks = availableWorksQuery.data ?? [];

  return {
    /** The mode the platform resolved the researcher in. */
    mode: authorsQuery.data?.mode ?? null,
    authors,
    isLoadingAuthors:
      authorsQuery.isPending && authorsQuery.fetchStatus !== 'idle',
    isFailedAuthors: authorsQuery.isError,
    refetchAuthors: () => authorsQuery.refetch(),
    availableWorks,
    isLoadingWorks:
      availableWorksQuery.isPending &&
      availableWorksQuery.fetchStatus !== 'idle',
    isFailedWorks: availableWorksQuery.isError,
    refetchWorks: () => availableWorksQuery.refetch(),
    pullWorks: (openAlexAuthorId?: string) =>
      pullMutation.mutateAsync({
        data: openAlexAuthorId ? { openAlexAuthorId } : {},
      }),
    isPulling: pullMutation.isPending,
    pullResult: pullMutation.data,
  };
}

/**
 * The candidates the onboarding pull produced.
 *
 * The same list the profile tab shows, so the onboarding step and the
 * profile page agree on what a candidate is.
 */
export function useOnboardingCandidates({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const listQuery = useOpenAlexControllerFindAll(
    { page: 1, limit: 50 },
    {
      query: {
        enabled,
        staleTime: 30 * 1000,
      },
    },
  );

  const candidates: CandidateWorkDto[] = listQuery.data?.items ?? [];
  return {
    candidates,
    isLoading: listQuery.isPending && listQuery.fetchStatus !== 'idle',
    isFailed: listQuery.isError,
    refetch: () => listQuery.refetch(),
  };
}
