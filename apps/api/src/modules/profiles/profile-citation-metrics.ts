import type { ProfileCitationMetricsDto } from './dto/profile-citation-metrics.dto.js';

/**
 * The OpenAlex metric columns of a `researcher_profiles` row.
 *
 * The four columns are nullable and are read as one block, so the
 * mapper takes them as a group rather than one column at a time.
 */
export interface OpenAlexMetricColumns {
  openalex_works_count: number | null;
  openalex_cited_by_count: number | null;
  openalex_h_index: number | null;
  openalex_i10_index: number | null;
}

/**
 * Maps the OpenAlex metric columns into the citation metrics block.
 *
 * The block is null unless at least one metric was recorded: a profile
 * whose four metrics are all null carries no information, and an absent
 * block is easier for a reader to skip than four zeros.
 *
 * A null inside the block stays a null — "no h-index" and "an h-index of
 * zero" are different facts, and the second is a claim the platform
 * cannot make.
 */
export function mapCitationMetrics(
  profile: OpenAlexMetricColumns | null | undefined,
): ProfileCitationMetricsDto | null {
  if (!profile) {
    return null;
  }

  /*
   * The columns are read with `?? null` rather than trusted as they
   * are: a row read through a partial select carries `undefined` where
   * the column is missing, and `undefined` is not the same fact as
   * `null` on the wire.
   */
  const worksCount = profile.openalex_works_count ?? null;
  const citedByCount = profile.openalex_cited_by_count ?? null;
  const hIndex = profile.openalex_h_index ?? null;
  const i10Index = profile.openalex_i10_index ?? null;

  if (
    worksCount === null &&
    citedByCount === null &&
    hIndex === null &&
    i10Index === null
  ) {
    return null;
  }

  return { worksCount, citedByCount, hIndex, i10Index };
}
