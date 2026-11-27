'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getAuthControllerMeQueryKey,
  getInterestsControllerListQueryKey,
  getOpenAlexControllerFindAllQueryKey,
  getProfilesControllerGetInterestsByUserIdQueryKey,
  getProfilesControllerGetMyProfileQueryKey,
  useInterestsControllerCreate,
  useOpenAlexControllerFindAuthors,
  useOpenAlexControllerPullWorks,
  useProfilesControllerCompleteOnboarding,
  useProfilesControllerGetInterestsByUserId,
  useTaxonomyControllerFindAllTopics,
} from '@/lib/api';
import type { OpenAlexAuthorCandidateDto } from '@/lib/api/models';
import { useOpenAlexCandidates } from './use-openalex-candidates';

/**
 * The steps of the onboarding, in order.
 *
 * Only the first one is mandatory: a researcher with no OpenAlex profile
 * and no interest in filling in their biography still has to pick at
 * least one research interest, and everything else may be skipped.
 */
export type OnboardingStep = 'interests' | 'author' | 'profile' | 'works';

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'interests',
  'author',
  'profile',
  'works',
];

/**
 * The steps the researcher may skip.
 *
 * The interest step is not in the list — it is the mandatory one.
 */
export const OPTIONAL_ONBOARDING_STEPS: OnboardingStep[] = [
  'author',
  'profile',
  'works',
];

/**
 * The research interests the researcher already declared.
 *
 * The shape carries the topic name and its taxonomy path, so the step
 * can show what was picked rather than a list of UUIDs.
 */
export interface OnboardingInterest {
  /** The topic id. */
  topicId: string;
  /** The topic name. */
  topicName: string;
  /** The field › subfield path of the topic. */
  topicPath: string;
}

/**
 * The state of the onboarding flow.
 *
 * The hook owns the four steps' data and the actions that move the flow
 * forward. It does not own the *current step* — that is the screen's
 * state, because it is a presentation decision rather than server state.
 */
export interface OnboardingState {
  /** The steps the researcher can visit, in order. */
  steps: OnboardingStep[];
  /** The research interests the researcher already declared. */
  interests: OnboardingInterest[];
  /** The OpenAlex author candidates found for the researcher. */
  authors: OpenAlexAuthorCandidateDto[];
  /** How the author list was produced: AUTHOR_ID, ORCID or NAME. */
  authorMode: 'AUTHOR_ID' | 'ORCID' | 'NAME' | null;
  /** Whether the author list is still loading. */
  isLoadingAuthors: boolean;
  /** Whether the author list failed to load. */
  isFailedAuthors: boolean;
  /** Retries the author search. */
  refetchAuthors: () => void;
  /** Whether a pull is in flight. */
  isPulling: boolean;
  /** Whether the interest list is still loading. */
  isLoadingInterests: boolean;
  /** Declares a research interest. */
  declareInterest: (topicId: string) => Promise<void>;
  /** Whether a declaration is in flight. */
  isDeclaringInterest: boolean;
  /** The candidates the pull produced, for the works step. */
  candidates: ReturnType<typeof useOpenAlexCandidates>['candidates'];
  /** Whether the candidate list is still loading. */
  isLoadingCandidates: boolean;
  /** Whether the candidate list failed to load. */
  isFailedCandidates: boolean;
  /** Retries the candidate list. */
  refetchCandidates: () => void;
  /** Accepts a candidate work. */
  acceptWork: ReturnType<typeof useOpenAlexCandidates>['acceptWork'];
  /** Rejects a candidate work. */
  rejectWork: ReturnType<typeof useOpenAlexCandidates>['rejectWork'];
  /** Whether an accept or a reject is in flight. */
  isDeciding: boolean;
  /**
   * Confirms an OpenAlex author and pulls the works it holds.
   *
   * The pull records the confirmed author on the profile, so every later
   * pull resolves through it instead of the name fallback.
   */
  confirmAuthor: (shortId: string) => Promise<void>;
  /** Pulls the works without confirming an author. */
  pullWithoutAuthor: () => Promise<void>;
  /** Finishes the onboarding: writes the profile and marks it complete. */
  completeOnboarding: (payload: OnboardingProfilePayload) => Promise<void>;
  /** Whether the completion is in flight. */
  isCompleting: boolean;
}

/**
 * The profile information the onboarding's profile step collects.
 *
 * The fields land on two tables: the account fields on `users`, the
 * profile fields on `researcher_profiles`. The ORCID is here rather than
 * in the ordinary profile update, because the onboarding is the one
 * moment where it is a first claim.
 */
export interface OnboardingProfilePayload {
  fullName?: string;
  departmentUnit?: string;
  academicTitle?: string | null;
  academicDegree?: string | null;
  orcidId?: string | null;
  bio?: string;
  availabilityStatus?:
    | 'OPEN_FOR_COLLABORATION'
    | 'SEEKING_GROUP'
    | 'MENTORING_ONLY'
    | 'LIMITED_AVAILABILITY'
    | 'NOT_AVAILABLE';
  googleScholarUrl?: string;
  scopusAuthorId?: string;
}

/**
 * The onboarding's data layer.
 *
 * ## Why the author list is only loaded on the author step
 *
 * The author search costs an OpenAlex round trip, and a researcher who
 * never opens the author step should not pay for it. The query is
 * therefore enabled per step rather than on mount.
 *
 * ## Why the interests are read through the profile route
 *
 * The interest step is the mandatory one, and the researcher may already
 * have declared interests before the onboarding. The profile route
 * returns the caller's own interests **with the topic name and its
 * taxonomy path**, which is what the step has to show — the plain
 * interests route carries only the topic id.
 */
export function useOnboarding({
  step,
  userId,
  enabled = true,
}: {
  /** The step the flow is currently on. */
  step: OnboardingStep;
  /** The signed-in researcher. */
  userId?: string;
  /** Whether the flow is active at all. */
  enabled?: boolean;
} = { step: 'interests' }): OnboardingState {
  const queryClient = useQueryClient();

  const interestsQuery = useProfilesControllerGetInterestsByUserId(
    userId ?? '',
    {
      query: {
        enabled: enabled && Boolean(userId) && step === 'interests',
        staleTime: 30 * 1000,
      },
    },
  );

  const authorsQuery = useOpenAlexControllerFindAuthors({
    query: {
      enabled: enabled && step === 'author',
      staleTime: 5 * 60 * 1000,
    },
  });

  const createInterestMutation = useInterestsControllerCreate({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getInterestsControllerListQueryKey(),
          }),
          userId
            ? queryClient.invalidateQueries({
                queryKey:
                  getProfilesControllerGetInterestsByUserIdQueryKey(userId),
              })
            : Promise.resolve(),
        ]);
      },
    },
  });

  const pullMutation = useOpenAlexControllerPullWorks({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: getOpenAlexControllerFindAllQueryKey({ page: 1, limit: 20 }),
        });
      },
    },
  });

  const completeMutation = useProfilesControllerCompleteOnboarding({
    mutation: {
      onSuccess: async () => {
        /*
         * The onboarding gate reads `onboardingCompleted` off the session,
         * and the profile screen reads the profile. Both have to learn
         * that the onboarding is done, or the gate keeps sending the
         * researcher back here.
         */
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getAuthControllerMeQueryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: getProfilesControllerGetMyProfileQueryKey(),
          }),
        ]);
      },
    },
  });

  const candidates = useOpenAlexCandidates({
    enabled: enabled && step === 'works',
  });

  const interests: OnboardingInterest[] = (
    interestsQuery.data ?? []
  )
    .filter((interest) => interest.status === 'ACTIVE')
    .map((interest) => {
      const { field, subfield, topic } = interest.topicPath;
      return {
        topicId: interest.topicId,
        topicName: topic?.name ?? '',
        topicPath: [field?.name, subfield?.name].filter(Boolean).join(' › '),
      };
    });

  return {
    steps: ONBOARDING_STEPS,
    interests,
    authors: authorsQuery.data?.authors ?? [],
    authorMode: authorsQuery.data?.mode ?? null,
    isLoadingAuthors:
      authorsQuery.isPending && authorsQuery.fetchStatus !== 'idle',
    isFailedAuthors: authorsQuery.isError,
    refetchAuthors: () => {
      void authorsQuery.refetch();
    },
    isPulling: pullMutation.isPending,
    isLoadingInterests:
      interestsQuery.isPending && interestsQuery.fetchStatus !== 'idle',
    declareInterest: async (topicId: string) => {
      await createInterestMutation.mutateAsync({ data: { topicId } });
    },
    isDeclaringInterest: createInterestMutation.isPending,
    candidates: candidates.candidates,
    isLoadingCandidates: candidates.isLoading,
    isFailedCandidates: candidates.isFailed,
    refetchCandidates: () => {
      candidates.refetch();
    },
    acceptWork: candidates.acceptWork,
    rejectWork: candidates.rejectWork,
    isDeciding: candidates.isAccepting || candidates.isRejecting,
    confirmAuthor: async (shortId: string) => {
      await pullMutation.mutateAsync({ data: { openAlexAuthorId: shortId } });
    },
    pullWithoutAuthor: async () => {
      await pullMutation.mutateAsync({ data: {} });
    },
    completeOnboarding: async (payload: OnboardingProfilePayload) => {
      await completeMutation.mutateAsync({ data: payload });
    },
    isCompleting: completeMutation.isPending,
  };
}

/**
 * The research topics the interest step offers.
 *
 * The taxonomy is a public reference tree, so the topics are fetched
 * without a session. The search is the researcher's own typing, so the
 * query only runs once there is something to search for — the empty
 * result of the first page would be a list of everything, which is not
 * what a picker wants.
 */
export function useInterestTopics({
  search,
  enabled = true,
}: {
  /** The researcher's search text. */
  search: string;
  /** Whether the picker is open at all. */
  enabled?: boolean;
}) {
  const query = useTaxonomyControllerFindAllTopics(
    { search: search.trim() || undefined, limit: 20, isActive: true },
    {
      query: {
        enabled: enabled && search.trim() !== '',
        staleTime: 60 * 1000,
      },
    },
  );

  return {
    topics: query.data?.items ?? [],
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    isFailed: query.isError,
    refetch: () => query.refetch(),
  };
}
