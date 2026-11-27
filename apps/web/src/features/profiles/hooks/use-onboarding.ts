'use client';

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getAuthControllerMeQueryKey,
  getOpenAlexControllerFindAllQueryKey,
  getProfilesControllerGetMyProfileQueryKey,
  useOpenAlexControllerFindAuthors,
  useOpenAlexControllerFindAvailableWorks,
  useProfilesControllerFinalizeOnboarding,
  useTaxonomyControllerFindAllTopics,
} from '@/lib/api';
import type { OpenAlexAuthorCandidateDto } from '@/lib/api/models';
import type {
  OnboardingDraftStore,
  OnboardingDraftWorkDecision,
} from '../store/onboarding-draft-store';

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
 * One work the researcher is deciding on.
 *
 * The preview carries the OpenAlex id, and the decision is keyed by it —
 * the platform's candidate row does not exist yet.
 */
export interface OnboardingWorkPreview {
  /** The OpenAlex work id, in the short form. */
  workId: string;
  /** The canonical OpenAlex id. */
  canonicalId: string;
  /** The work title. */
  title: string;
  /** The normalised DOI, when the work has one. */
  doi: string | null;
  /** The publication year, when OpenAlex reports one. */
  publicationYear: number | null;
  /** The platform output-type vocabulary. */
  outputType: string;
  /** The venue, when OpenAlex reports one. */
  venue: string | null;
  /** Whether the work was resolved through a confirmed identifier. */
  confirmed: boolean;
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
  /** The topic ids the researcher picked, in the draft. */
  topicIds: string[];
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
  /** The confirmed OpenAlex author, from the draft. */
  confirmedAuthorId: string | null;
  /** The ORCID OpenAlex reports for the confirmed author. */
  openAlexOrcid: string | null;
  /** The works OpenAlex holds for the confirmed author. */
  works: OnboardingWorkPreview[];
  /** Whether the works preview is still loading. */
  isLoadingWorks: boolean;
  /** Whether the works preview failed to load. */
  isFailedWorks: boolean;
  /** Retries the works preview. */
  refetchWorks: () => void;
  /** The decisions the researcher made on the works. */
  workDecisions: Record<string, OnboardingDraftWorkDecision>;
  /** Finishes the onboarding: writes the whole draft in one call. */
  finalizeOnboarding: () => Promise<void>;
  /** Whether the finalize is in flight. */
  isFinalizing: boolean;
}

/**
 * The onboarding's data layer.
 *
 * ## Why nothing is written until the end
 *
 * The wizard is a draft. The researcher picks interests, confirms an
 * author, fills in their information and decides on their works — and
 * none of it reaches the database until they press **Finish**. The
 * draft lives in the store; this hook reads it and owns the two reads
 * that need the network (the author list and the works preview) plus
 * the single write that ends the flow.
 *
 * ## Why the author list is only loaded on the author step
 *
 * The author search costs an OpenAlex round trip, and a researcher who
 * never opens the author step should not pay for it. The query is
 * therefore enabled per step rather than on mount.
 *
 * ## Why the works preview is live rather than stored
 *
 * OpenAlex is the authority on what exists. A list cached in the draft
 * would go stale while the researcher is deciding, and the decision
 * would be applied to a work that no longer looks the same. The preview
 * is read live, and the decisions are keyed by the OpenAlex id — so a
 * change in the list does not lose what the researcher decided.
 */
export function useOnboarding({
  step,
  draft,
  enabled = true,
}: {
  /** The step the flow is currently on. */
  step: OnboardingStep;
  /** The draft store. */
  draft: OnboardingDraftStore;
  /** Whether the flow is active at all. */
  enabled?: boolean;
}): OnboardingState {
  const queryClient = useQueryClient();

  const topicIds = useOnboardingTopicIds(draft);
  const confirmedAuthorId = useOnboardingConfirmedAuthorId(draft);
  const openAlexOrcid = useOnboardingOpenAlexOrcid(draft);
  const workDecisions = useOnboardingWorkDecisions(draft);

  const authorsQuery = useOpenAlexControllerFindAuthors({
    query: {
      enabled: enabled && step === 'author',
      staleTime: 5 * 60 * 1000,
    },
  });

  /*
   * The works preview follows the confirmed author. It runs as soon as
   * there is an author, not only on the works step, so the preview is
   * already there when the researcher arrives — and so a researcher who
   * goes back to the author step and picks somebody else sees the list
   * change underneath them.
   *
   * Without a confirmed author the query still runs on the works step,
   * and the server resolves the researcher through the name fallback.
   * That is the path a researcher who skipped the author step takes,
   * and it is the same preview the platform has always shown.
   */
  const worksQuery = useOpenAlexControllerFindAvailableWorks(
    { authorId: confirmedAuthorId ?? undefined },
    {
      query: {
        enabled:
          enabled && (step === 'works' || confirmedAuthorId !== null),
        staleTime: 5 * 60 * 1000,
      },
    },
  );

  const finalizeMutation = useProfilesControllerFinalizeOnboarding({
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
          queryClient.invalidateQueries({
            queryKey: getOpenAlexControllerFindAllQueryKey({ page: 1, limit: 20 }),
          }),
        ]);
      },
    },
  });

  const works: OnboardingWorkPreview[] = useMemo(
    () =>
      (worksQuery.data ?? []).map((work) => ({
        workId: work.shortId,
        canonicalId: work.workId,
        title: work.title,
        doi: work.doi,
        publicationYear: work.publicationYear,
        outputType: work.outputType,
        venue: work.venue,
        confirmed: work.confirmed,
      })),
    [worksQuery.data],
  );

  return {
    steps: ONBOARDING_STEPS,
    topicIds,
    authors: authorsQuery.data?.authors ?? [],
    authorMode: authorsQuery.data?.mode ?? null,
    isLoadingAuthors:
      authorsQuery.isPending && authorsQuery.fetchStatus !== 'idle',
    isFailedAuthors: authorsQuery.isError,
    refetchAuthors: () => {
      void authorsQuery.refetch();
    },
    confirmedAuthorId,
    openAlexOrcid,
    works,
    isLoadingWorks:
      worksQuery.isPending && worksQuery.fetchStatus !== 'idle',
    isFailedWorks: worksQuery.isError,
    refetchWorks: () => {
      void worksQuery.refetch();
    },
    workDecisions,
    finalizeOnboarding: async () => {
      const state = draft.getState();
      const profile = state.profileValues;

      await finalizeMutation.mutateAsync({
        data: {
          topicIds: state.topicIds,
          ...(state.confirmedAuthorId
            ? { openAlexAuthorId: state.confirmedAuthorId }
            : {}),
          ...(profile
            ? {
                ...(profile.fullName
                  ? { fullName: profile.fullName }
                  : {}),
                ...(profile.departmentUnit
                  ? { departmentUnit: profile.departmentUnit }
                  : {}),
                ...(profile.academicTitle !== undefined
                  ? { academicTitle: profile.academicTitle }
                  : {}),
                ...(profile.academicDegree !== undefined
                  ? { academicDegree: profile.academicDegree }
                  : {}),
                ...(profile.orcidId ? { orcidId: profile.orcidId } : {}),
                ...(profile.bio ? { bio: profile.bio } : {}),
                ...(profile.availabilityStatus
                  ? {
                      availabilityStatus: profile.availabilityStatus,
                    }
                  : {}),
                ...(profile.googleScholarUrl
                  ? { googleScholarUrl: profile.googleScholarUrl }
                  : {}),
                ...(profile.scopusAuthorId
                  ? { scopusAuthorId: profile.scopusAuthorId }
                  : {}),
              }
            : {}),
          works: Object.entries(state.workDecisions).map(
            ([workId, decision]) => ({
              workId,
              accepted: decision.accepted,
              visibility: decision.visibility,
            }),
          ),
        },
      });
    },
    isFinalizing: finalizeMutation.isPending,
  };
}

/**
 * The topic ids in the draft.
 *
 * A selector rather than a direct read, so a component that only cares
 * about the topics does not re-render when the author changes.
 */
export function useOnboardingTopicIds(draft: OnboardingDraftStore): string[] {
  return draft((state) => state.topicIds);
}

/** The confirmed OpenAlex author in the draft. */
export function useOnboardingConfirmedAuthorId(
  draft: OnboardingDraftStore,
): string | null {
  return draft((state) => state.confirmedAuthorId);
}

/** The ORCID of the confirmed author in the draft. */
export function useOnboardingOpenAlexOrcid(
  draft: OnboardingDraftStore,
): string | null {
  return draft((state) => state.openAlexOrcid);
}

/** The decisions on the works in the draft. */
export function useOnboardingWorkDecisions(
  draft: OnboardingDraftStore,
): Record<string, OnboardingDraftWorkDecision> {
  return draft((state) => state.workDecisions);
}

/**
 * The research topics the interest step offers.
 *
 * The taxonomy is a public reference tree, so the topics are fetched
 * without a session.
 *
 * ## Why the list loads without a search
 *
 * The picker opens with the first page of the active taxonomy already
 * in it. A researcher who knows what they want searches for it; a
 * researcher who does not browse the list the way every other picker
 * works. Making the list appear only after a keystroke would hide the
 * taxonomy behind the search box for no gain — the page is paginated,
 * so it is never the whole tree.
 */
export function useInterestTopics({ search }: { search: string }) {
  const query = useTaxonomyControllerFindAllTopics(
    { search: search.trim() || undefined, limit: 20, isActive: true },
    {
      query: {
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

/**
 * Clears the draft once the onboarding is written.
 *
 * The draft is the researcher's own scratch space; once the answers are
 * stored, keeping it would let a later session start from a stale copy
 * of the interests.
 */
export function useClearOnboardingDraft(draft: OnboardingDraftStore): void {
  const reset = draft((state) => state.reset);

  useEffect(() => {
    return () => reset();
  }, [reset]);
}
