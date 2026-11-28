import { describe, expect, it } from 'vitest';
import {
  createOnboardingDraftStore,
  type OnboardingDraftOpenAlexAuthor,
} from './onboarding-draft-store';

/**
 * The OpenAlex record the author step hands to the draft.
 */
const author: OnboardingDraftOpenAlexAuthor = {
  displayName: 'Nguyen Hoang Khoi Tran',
  orcid: 'https://orcid.org/0000-0001-7323-9213',
  nameVariants: ['Tran, Nguyen H'],
  topics: [{ id: 'T1', name: 'Topic One', count: 3 }],
  affiliations: [
    {
      institutionId: 'I109689652',
      name: 'FPT University',
      ror: 'https://ror.org/03esj4g97',
      countryCode: 'VN',
      institutionType: 'education',
      yearStart: 2020,
      yearEnd: 2026,
    },
  ],
  counts: {
    worksCount: 42,
    citedByCount: 318,
    hIndex: 7,
    i10Index: 4,
    twoYearMeanCitedness: 2.5,
  },
};

describe('the onboarding draft store', () => {
  it('keeps the OpenAlex record of the confirmed author', () => {
    // The profile step prefills from the record, so it has to survive
    // in the draft — the author step is not re-fetched when the
    // researcher comes back to the profile step.
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().confirmAuthor('A5027558961', author.orcid, author);

    expect(draft.getState().openAlexAuthor).toEqual(author);
    expect(draft.getState().openAlexOrcid).toBe(author.orcid);
  });

  it('drops the record when the author is unconfirmed', () => {
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().confirmAuthor('A5027558961', author.orcid, author);
    draft.getState().clearAuthor();

    expect(draft.getState().openAlexAuthor).toBeNull();
    expect(draft.getState().openAlexOrcid).toBeNull();
  });

  it('replaces the record when a different author is confirmed', () => {
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().confirmAuthor('A1', 'https://orcid.org/1', author);
    draft.getState().confirmAuthor('A2', 'https://orcid.org/2', null);

    expect(draft.getState().openAlexAuthor).toBeNull();
    expect(draft.getState().openAlexOrcid).toBe('https://orcid.org/2');
  });

  it('drops the profile values when a different author is confirmed', () => {
    /*
     * The profile values were prefilled from the previous author's
     * OpenAlex record, so they belong to that author. Keeping them
     * would let the old author's name and ORCID win over the record the
     * researcher has just confirmed.
     */
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().confirmAuthor('A1', author.orcid, author);
    draft.getState().setProfileValues({
      fullName: author.displayName,
      orcidId: '0000-0001-7323-9213',
    });

    draft.getState().confirmAuthor('A2', 'https://orcid.org/2', null);

    expect(draft.getState().profileValues).toBeNull();
  });

  it('keeps the profile values when the same author is confirmed again', () => {
    /*
     * Re-confirming the same author changes nothing about the
     * researcher, so what they typed is still theirs.
     */
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().confirmAuthor('A1', author.orcid, author);
    draft.getState().setProfileValues({ fullName: 'Nguyen Hoang Khoi Tran' });

    draft.getState().confirmAuthor('A1', author.orcid, author);

    expect(draft.getState().profileValues).toEqual({
      fullName: 'Nguyen Hoang Khoi Tran',
    });
  });

  it('keeps the draft in memory only', () => {
    /*
     * The draft is not persisted: a reload loses it, and the flow
     * warns the researcher before they leave the page. A second store
     * for the same researcher starts empty, because the first one kept
     * its answers in memory rather than in a shared storage.
     */
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().addTopic('T1', 'Topic One');

    const reloaded = createOnboardingDraftStore('user-1');

    expect(draft.getState().topicIds).toEqual(['T1']);
    expect(reloaded.getState().topicIds).toEqual([]);
  });

  it('keeps the affiliation timeline the researcher edited', () => {
    /*
     * The timeline is the one part of the OpenAlex record the
     * researcher may correct, so it travels in the draft and reaches
     * the finalize call.
     */
    const draft = createOnboardingDraftStore('user-1');
    const timeline = [
      {
        institutionId: 'I109689652',
        name: 'FPT University',
        ror: null,
        countryCode: 'VN',
        institutionType: 'EDUCATION' as const,
        yearStart: 2020,
        yearEnd: null,
      },
    ];

    draft.getState().setAffiliationValues(timeline);

    expect(draft.getState().affiliationValues).toEqual(timeline);
  });

  it('leaves the affiliation timeline alone until the researcher edits it', () => {
    /*
     * Null means the researcher never touched the timeline, and the
     * finalize call then says nothing about the affiliations — so the
     * rows the OpenAlex sync wrote stay as they are. An empty list is
     * a different thing: it is the researcher removing every
     * affiliation on purpose.
     */
    const draft = createOnboardingDraftStore('user-1');

    expect(draft.getState().affiliationValues).toBeNull();

    draft.getState().setAffiliationValues([]);

    expect(draft.getState().affiliationValues).toEqual([]);
  });

  it('drops the affiliation timeline when a different author is confirmed', () => {
    /*
     * "Where I was and until when" is the previous author's career,
     * so it cannot survive the switch to somebody else.
     */
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().confirmAuthor('A1', author.orcid, author);
    draft.getState().setAffiliationValues([
      {
        institutionId: 'I109689652',
        name: 'FPT University',
        ror: null,
        countryCode: 'VN',
        institutionType: 'EDUCATION',
        yearStart: 2020,
        yearEnd: null,
      },
    ]);

    draft.getState().confirmAuthor('A2', 'https://orcid.org/2', null);

    expect(draft.getState().affiliationValues).toBeNull();
  });

  it('keeps the affiliation timeline when the same author is confirmed again', () => {
    /*
     * Re-confirming the same author changes nothing about the
     * researcher, so the corrections they made are still theirs.
     */
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().confirmAuthor('A1', author.orcid, author);
    draft.getState().setAffiliationValues([
      {
        institutionId: 'I109689652',
        name: 'FPT University',
        ror: null,
        countryCode: 'VN',
        institutionType: 'EDUCATION',
        yearStart: 2020,
        yearEnd: null,
      },
    ]);

    draft.getState().confirmAuthor('A1', author.orcid, author);

    expect(draft.getState().affiliationValues).toHaveLength(1);
  });

  it('drops the affiliation timeline when the author is unconfirmed', () => {
    /*
     * The researcher went back and unconfirmed their author, so the
     * timeline they edited belonged to that author and is gone with it.
     */
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().confirmAuthor('A1', author.orcid, author);
    draft.getState().setAffiliationValues([
      {
        institutionId: 'I109689652',
        name: 'FPT University',
        ror: null,
        countryCode: 'VN',
        institutionType: 'EDUCATION',
        yearStart: 2020,
        yearEnd: null,
      },
    ]);

    draft.getState().clearAuthor();

    expect(draft.getState().affiliationValues).toBeNull();
  });

  it('empties the affiliation timeline when the draft is reset', () => {
    /*
     * The draft is emptied once the onboarding is written, so a later
     * session cannot start from a stale copy of the timeline.
     */
    const draft = createOnboardingDraftStore('user-1');

    draft.getState().setAffiliationValues([
      {
        institutionId: 'I109689652',
        name: 'FPT University',
        ror: null,
        countryCode: 'VN',
        institutionType: 'EDUCATION',
        yearStart: 2020,
        yearEnd: null,
      },
    ]);

    draft.getState().reset();

    expect(draft.getState().affiliationValues).toBeNull();
  });
});
