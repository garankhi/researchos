'use client';

import { create } from 'zustand';
import type { OnboardingAffiliationDto } from '@/lib/api/models';

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
 * ## Why it is not persisted
 *
 * The draft lives in memory only, so it is gone on a reload and gone
 * when the tab is closed. That is deliberate: a half-finished draft in
 * `localStorage` is a stale record of a researcher who may never come
 * back, and the server has no idea it exists.
 *
 * The consequence is that leaving the page costs the researcher their
 * answers — so the flow warns them before they go.
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
   *
   * They belong to the author that was confirmed when they were
   * recorded, so they are dropped when a *different* author is
   * confirmed: the prefilled name and ORCID would otherwise belong to
   * the previous author.
   */
  profileValues: OnboardingDraftProfileValues | null;
  /**
   * The affiliation timeline the researcher edited.
   *
   * It is `null` until the researcher touches the timeline, and that
   * distinction matters: the finalize call sends the affiliations only
   * when the researcher edited them, because omitting the field leaves
   * the rows the OpenAlex sync wrote exactly as they are. A draft that
   * merely *held* the OpenAlex rows would silently replace them with
   * the same rows and lose the country code and the institution type
   * the sync had written.
   *
   * The rows belong to the author that was confirmed when they were
   * recorded, so they are dropped when a *different* author is
   * confirmed, exactly like the profile values.
   */
  affiliationValues: OnboardingAffiliationDto[] | null;
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
export type OnboardingDraftStep = 'interests' | 'author' | 'profile' | 'works';

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
 * DTO, because the DTO is the API's shape, not the draft's.
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
    /**
     * The ROR id of the institution, when OpenAlex knows one.
     *
     * It is optional because the author candidate's affiliation does not
     * carry it: the candidate is the thin read OpenAlex hands out, and
     * the ROR id only arrives with the full author record.
     */
    ror?: string | null;
    countryCode: string | null;
    /**
     * The kind of institution, as OpenAlex words it (`education`,
     * `company`, ...).
     *
     * It is the raw string rather than the platform's enum, because the
     * record is OpenAlex's vocabulary; the profile step maps it onto
     * the enum the API stores.
     */
    institutionType?: string | null;
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
  /**
   * Records the affiliation timeline the researcher edited.
   *
   * The whole set is recorded, not a delta: the server replaces the
   * rows, so the set the researcher ended up with is what has to
   * travel.
   */
  setAffiliationValues: (values: OnboardingAffiliationDto[] | null) => void;
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

const emptyDraft: OnboardingDraftState = {
  topicIds: [],
  topicNames: {},
  confirmedAuthorId: null,
  openAlexOrcid: null,
  openAlexAuthor: null,
  profileValues: null,
  workDecisions: {},
  affiliationValues: null,
  step: 'interests',
};

/**
 * The onboarding draft store.
 *
 * The store is created per researcher rather than as a module-level
 * singleton, so two accounts in the same browser never share a draft:
 * one researcher's answers cannot surface in another researcher's
 * onboarding.
 *
 * The draft lives in memory only. It is not persisted, so a reload
 * empties it — which is why the flow guards the page while there is
 * something to lose.
 *
 * @param userId The researcher the draft belongs to. The instance is
 * the namespace, so the id is not read here; it stays in the signature
 * because the call site creates the store per researcher.
 */
export function createOnboardingDraftStore(userId: string | undefined) {
  // The instance is the namespace; the id only says which researcher
  // this one belongs to. Referenced so the parameter is not reported as
  // unused.
  void userId;

  return create<OnboardingDraftState & OnboardingDraftActions>()((set) => ({
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
         *
         * The profile values are dropped for the same reason. They
         * belong to the previous author — the name and the ORCID were
         * prefilled from that author's OpenAlex record — so keeping
         * them would let the old author's identity win over the record
         * the researcher has just confirmed.
         *
         * So is the affiliation timeline: "where I was and until
         * when" is the previous author's career.
         */
        const authorChanged = state.confirmedAuthorId !== authorId;
        return {
          confirmedAuthorId: authorId,
          openAlexOrcid: orcid,
          openAlexAuthor: author ?? null,
          workDecisions: authorChanged ? {} : state.workDecisions,
          profileValues: authorChanged ? null : state.profileValues,
          affiliationValues: authorChanged ? null : state.affiliationValues,
        };
      }),

    clearAuthor: () =>
      set({
        confirmedAuthorId: null,
        openAlexOrcid: null,
        openAlexAuthor: null,
        workDecisions: {},
        profileValues: null,
        affiliationValues: null,
      }),

    setProfileValues: (values) => set({ profileValues: values }),

    setAffiliationValues: (values) => set({ affiliationValues: values }),

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
  }));
}

/** The type of a draft store. */
export type OnboardingDraftStore = ReturnType<
  typeof createOnboardingDraftStore
>;
