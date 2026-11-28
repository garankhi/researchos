import { describe, expect, it } from 'vitest';
import { mapCitationMetrics } from './profile-citation-metrics.js';

describe('mapCitationMetrics', () => {
  it('returns null when the profile has no row', () => {
    expect(mapCitationMetrics(null)).toBeNull();
    expect(mapCitationMetrics(undefined)).toBeNull();
  });

  it('returns null when every metric is null', () => {
    expect(
      mapCitationMetrics({
        openalex_works_count: null,
        openalex_cited_by_count: null,
        openalex_h_index: null,
        openalex_i10_index: null,
      }),
    ).toBeNull();
  });

  it('maps the four metrics', () => {
    expect(
      mapCitationMetrics({
        openalex_works_count: 47,
        openalex_cited_by_count: 1712,
        openalex_h_index: 19,
        openalex_i10_index: 23,
      }),
    ).toEqual({
      worksCount: 47,
      citedByCount: 1712,
      hIndex: 19,
      i10Index: 23,
    });
  });

  it('keeps a null metric null rather than reporting a zero', () => {
    expect(
      mapCitationMetrics({
        openalex_works_count: 47,
        openalex_cited_by_count: null,
        openalex_h_index: null,
        openalex_i10_index: null,
      }),
    ).toEqual({
      worksCount: 47,
      citedByCount: null,
      hIndex: null,
      i10Index: null,
    });
  });

  it('treats a missing column as null, not as undefined', () => {
    const metrics = mapCitationMetrics({
      openalex_works_count: 47,
    } as unknown as Parameters<typeof mapCitationMetrics>[0]);

    expect(metrics).toEqual({
      worksCount: 47,
      citedByCount: null,
      hIndex: null,
      i10Index: null,
    });
  });
});
