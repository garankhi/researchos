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
      countryCode: 'VN',
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
});
