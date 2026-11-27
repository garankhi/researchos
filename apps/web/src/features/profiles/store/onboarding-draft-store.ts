'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * The onboarding draft.
 *
 * ## What a draft is
 *
 * The onboarding is four steps, and the researcher answers questions in
 * all of them before anything is worth storing. Writing each answer as
 * it is given would mean the platform holds a half-finished researcher:
 * an interest with no profile, a profile with no works, a work the
 * researcher is about to reject.
 *
 * So the wizard keeps everything on the client until the researcher
 * presses **Finish**. This store is that draft.
 *
 * ## Why a store rather than component state
 *
 * The steps are separate components, and the researcher may jump between
 * them — the step buttons stay visible on purpose. A local `useState`
 * in the flow would have to be threaded through every step as props,
 * and the works step would have to be told about an author picked two
 * steps earlier. The store is the single place the draft lives.
 *
 * ## Why it is persisted
 *
 * The onboarding is four steps and a form. A researcher who reloads the
 * page in the middle of it would otherwise lose everything they typed.
 * The draft is persisted to `localStorage`, which keeps it across a
 * reload without keeping it on the server.
 *
 * The persistence is namespaced per researcher: two accounts in the
 * same browser keep two drafts, and neither sees the other's.
 *
 * ## What is *not* in the draft
 *
 * The profile values are in it, the interests are in it, the confirmed
 * author is in it, and the decisions on the works are in it. The works
 * themselves are not — they are read live from OpenAlex, because
 * OpenAlex is the authority on what exists, and a cached list would go
 * stale while the researcher is deciding.
 */
export interface OnboardingDraftState {
  /**
   * The topic ids the researcher picked, in the order they picked them.
   *
   * The draft owns the whole set, so the finalize call can reconcile the
   * stored interests against it.
   */
  topicIds: string[];
  /**
   * The name of each picked topic, by topic id.
   *
   * The ids are what the finalize call needs, but a badge showing a
   * UUID tells the researcher nothing, so the name is kept alongside.
   */
  topicNames: Record<string, string>;
  /**
   * The OpenAlex author the researcher confirmed, or null.
   *
   * Null means the author step was skipped or the researcher went back
   * and unconfirmed it.
   */
  confirmedAuthorId: string | null;
  /**
   * The ORCID OpenAlex reports for the confirmed author.
   *
   * It prefills the profile step, so it is kept rather than looked up
   * again.
   */
  openAlexOrcid: string | null;
  /**
   * The OpenAlex record of the confirmed author, or null.
   *
   * The profile step prefills from it — the display name, the byline
   * spellings, the topics, the affiliations — so the researcher starts
   * from what OpenAlex holds and corrects it rather than typing it all.
   *
   * It is a snapshot of what the author step showed, kept in the draft
   * because the author step is not re-fetched when the researcher comes
   * back to the profile step.
   */
  openAlexAuthor: OnboardingDraftOpenAlexAuthor | null;
  /**
   * The profile values the researcher typed.
   *
   * They are kept as the step left them, so a researcher who goes back
   * and forward finds their own text rather than the prefilled one.
   */
  profileValues: OnboardingDraftProfileValues | null;
  /**
   * The decisions on the works, by OpenAlex work id.
   *
   * A work is in the map when the researcher decided on it, and carries
   * whether they accepted it and the visibility they chose.
   */
  workDecisions: Record<string, OnboardingDraftWorkDecision>;
  /** The step the researcher was on. */
  step: OnboardingDraftStep;
}

/** The steps of the onboarding, in order. */
export type OnboardingDraftStep =
  | 'interests'
  | 'author'
  | 'profile'
  | 'works';

/**
 * The profile values the profile step collects.
 *
 * The shape matches the profile step's schema output, so the values
 * travel from the form to the draft and on to the finalize call
 * unchanged. The strings are the ones the form produces after the
 * schema's trimming and the empty-string-to-null transforms.
 */
export interface OnboardingDraftProfileValues {
  fullName?: string;
  departmentUnit?: string;
  academicTitle?: string | null;
  academicDegree?: string | null;
  orcidId?: string | null;
  bio?: string | null;
  availabilityStatus?:
    | 'OPEN_FOR_COLLABORATION'
    | 'SEEKING_GROUP'
    | 'MENTORING_ONLY'
    | 'LIMITED_AVAILABILITY'
    | 'NOT_AVAILABLE';
  googleScholarUrl?: string | null;
  scopusAuthorId?: string | null;
}

/** One decision on one work. */
export interface OnboardingDraftWorkDecision {
  /** Whether the researcher accepted the work. */
  accepted: boolean;
  /** The visibility an accepted work is published with. */
  visibility: 'PRIVATE' | 'FPTU_COMMUNITY';
}

/**
 * The OpenAlex record of the confirmed author.
 *
 * The subset of the author candidate the profile step needs to prefill
 * the form. It is stored as a plain object rather than the generated
 * DTO, because the draft is persisted to `localStorage` and the DTO is
 * the API's shape, not the draft's.
 */
export interface OnboardingDraftOpenAlexAuthor {
  /** The OpenAlex display name of the author. */
  displayName: string;
  /** The ORCID OpenAlex reports for the author, if any. */
  orcid: string | null;
  /** The byline spellings OpenAlex has observed. */
  nameVariants: string[];
  /** The topics OpenAlex assigned to the author. */
  topics: Array<{ id: string; name: string; count: number | null }>;
  /** The affiliations of the author, with the years they held. */
  affiliations: Array<{
    institutionId: string;
    name: string;
    countryCode: string | null;
    yearStart: number | null;
    yearEnd: number | null;
  }>;
  /** The citation metrics OpenAlex reports for the author. */
  counts: {
    worksCount: number | null;
    citedByCount: number | null;
    hIndex: number | null;
    i10Index: number | null;
    twoYearMeanCitedness: number | null;
  };
}

/**
 * The actions the draft offers.
 */
export interface OnboardingDraftActions {
  /** Adds a topic to the draft set. */
  addTopic: (topicId: string, topicName?: string) => void;
  /** Removes a topic from the draft set. */
  removeTopic: (topicId: string) => void;
  /** Confirms an OpenAlex author. */
  confirmAuthor: (
    authorId: string,
    orcid: string | null,
    author?: OnboardingDraftOpenAlexAuthor | null,
  ) => void;
  /** Unconfirms the author — the researcher went back and changed their mind. */
  clearAuthor: () => void;
  /** Records the profile values. */
  setProfileValues: (values: OnboardingDraftProfileValues) => void;
  /** Records a decision on a work. */
  decideWork: (
    workId: string,
    accepted: boolean,
    visibility?: 'PRIVATE' | 'FPTU_COMMUNITY',
  ) => void;
  /** Withdraws a decision, so the work goes back to undecided. */
  undecideWork: (workId: string) => void;
  /** Moves to a step. */
  setStep: (step: OnboardingDraftStep) => void;
  /** Empties the draft, once the onboarding is written. */
  reset: () => void;
}

/** The storage key of the persisted draft. */
export function onboardingDraftKey(userId: string | undefined): string {
  return `researchos:onboarding-draft:${userId ?? 'anonymous'}`;
}

const emptyDraft: OnboardingDraftState = {
  topicIds: [],
  topicNames: {},
  confirmedAuthorId: null,
  openAlexOrcid: null,
  openAlexAuthor: null,
  profileValues: null,
  workDecisions: {},
  step: 'interests',
};

/**
 * The onboarding draft store.
 *
 * The store is created per researcher rather than as a module-level
 * singleton, because the persisted draft is namespaced per researcher
 * and a singleton would leak one researcher's draft into another's
 * session in the same browser.
 */
export function createOnboardingDraftStore(userId: string | undefined) {
  return create<OnboardingDraftState & OnboardingDraftActions>()(
    persist(
      (set) => ({
        ...emptyDraft,

        addTopic: (topicId, topicName) =>
          set((state) => {
            if (state.topicIds.includes(topicId)) {
              return state;
            }
            return {
              topicIds: [...state.topicIds, topicId],
              topicNames: topicName
                ? { ...state.topicNames, [topicId]: topicName }
                : state.topicNames,
            };
          }),

        removeTopic: (topicId) =>
          set((state) => {
            const topicNames = { ...state.topicNames };
            delete topicNames[topicId];
            return {
              topicIds: state.topicIds.filter((id) => id !== topicId),
              topicNames,
            };
          }),

        confirmAuthor: (authorId, orcid, author) =>
          set((state) => {
            /*
             * A different author means a different bibliography, so the
             * decisions the researcher made about the previous author's
             * works no longer apply. They are dropped rather than
             * carried over: accepting a work of somebody else would
             * attach it to the wrong researcher.
             */
            const authorChanged = state.confirmedAuthorId !== authorId;
            return {
              confirmedAuthorId: authorId,
              openAlexOrcid: orcid,
              openAlexAuthor: author ?? null,
              workDecisions: authorChanged ? {} : state.workDecisions,
            };
          }),

        clearAuthor: () =>
          set({
            confirmedAuthorId: null,
            openAlexOrcid: null,
            openAlexAuthor: null,
            workDecisions: {},
          }),

        setProfileValues: (values) => set({ profileValues: values }),

        decideWork: (workId, accepted, visibility = 'PRIVATE') =>
          set((state) => ({
            workDecisions: {
              ...state.workDecisions,
              [workId]: { accepted, visibility },
            },
          })),

        undecideWork: (workId) =>
          set((state) => {
            const next = { ...state.workDecisions };
            delete next[workId];
            return { workDecisions: next };
          }),

        setStep: (step) => set({ step }),

        reset: () => set({ ...emptyDraft }),
      }),
      {
        name: onboardingDraftKey(userId),
        storage: createJSONStorage(() => localStorage),
        /*
         * Only the answers are persisted. The step is not: a researcher
         * who reloads lands on the first step, which is where a
         * half-finished onboarding belongs.
         */
        partialize: (state) => ({
          topicIds: state.topicIds,
          topicNames: state.topicNames,
          confirmedAuthorId: state.confirmedAuthorId,
          openAlexOrcid: state.openAlexOrcid,
          openAlexAuthor: state.openAlexAuthor,
          profileValues: state.profileValues,
          workDecisions: state.workDecisions,
          step: state.step,
        }),
      },
    ),
  );
}

/** The type of a draft store. */
export type OnboardingDraftStore = ReturnType<
  typeof createOnboardingDraftStore
>;
