/**
 * The affiliation the researcher is at now.
 *
 * ## Why the rule lives in its own module
 *
 * Two writers fill the affiliation timeline: the OpenAlex record
 * service, which stores what OpenAlex reports, and the onboarding
 * finalize, which stores what the researcher corrected. Both have to
 * agree on which row is the current one, or the same researcher would
 * be "at" two institutions depending on which write ran last.
 *
 * So the rule is written once, here, and both callers read it.
 *
 * ## The rule
 *
 * The most recent affiliation by its last year. OpenAlex's own "last
 * known institution" is deliberately not used: it is the institution of
 * the latest *authorship*, which for a researcher who has moved is the
 * one they left.
 *
 * A tie on the last year is broken by the *first* year: among the
 * affiliations that are still running, the one that started earliest is
 * the home institution, and the others are the co-affiliations of a
 * particular paper. A researcher who was at FPT University from 2020
 * and at another university for one year in 2026 is at FPT University;
 * both rows end in 2026, and the longer one is the one that says where
 * they work.
 *
 * An affiliation with no end year is still running, so it is the most
 * recent one by definition.
 */

/**
 * The part of an affiliation the rule reads.
 *
 * Both the OpenAlex affiliation and the researcher's own edit carry
 * these three fields, so the rule can be written against the smallest
 * shape that answers the question.
 */
export interface AffiliationTimelineEntry {
  /** The OpenAlex institution id — the key the row is stored under. */
  institutionId: string;
  /** The first year the affiliation held, or null when unknown. */
  yearStart?: number | null;
  /** The last year the affiliation held, or null when still running. */
  yearEnd?: number | null;
}

/**
 * The institution id of the affiliation the researcher is at now.
 *
 * Null when there is no affiliation at all.
 */
export function primaryAffiliationId(
  affiliations: readonly AffiliationTimelineEntry[],
): string | null {
  let best: AffiliationTimelineEntry | null = null;

  for (const affiliation of affiliations) {
    if (best === null) {
      best = affiliation;
      continue;
    }

    const candidateEnd = affiliation.yearEnd ?? Number.MAX_SAFE_INTEGER;
    const bestEnd = best.yearEnd ?? Number.MAX_SAFE_INTEGER;

    if (candidateEnd > bestEnd) {
      best = affiliation;
      continue;
    }
    if (candidateEnd < bestEnd) {
      continue;
    }

    // A tie on the last year: the earlier start wins.
    const candidateStart = affiliation.yearStart ?? Number.MAX_SAFE_INTEGER;
    const bestStart = best.yearStart ?? Number.MAX_SAFE_INTEGER;

    if (candidateStart < bestStart) {
      best = affiliation;
    }
  }

  return best?.institutionId ?? null;
}
