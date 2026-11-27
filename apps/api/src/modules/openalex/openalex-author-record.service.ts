import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { OpenAlexClient } from './openalex.client.js';
import type {
  OpenAlexAffiliation,
  OpenAlexAuthorRecord,
} from './openalex.types.js';

/**
 * The institution types OpenAlex reports, and the platform's vocabulary.
 *
 * OpenAlex writes them in lower case; the database enum is upper case.
 * An unknown type becomes `OTHER` rather than being rejected: the record
 * is more useful with an imprecise type than without a row.
 */
const INSTITUTION_TYPES: Record<string, string> = {
  education: 'EDUCATION',
  company: 'COMPANY',
  healthcare: 'HEALTHCARE',
  nonprofit: 'NONPROFIT',
  government: 'GOVERNMENT',
  facility: 'FACILITY',
  archive: 'ARCHIVE',
  other: 'OTHER',
};

/**
 * Writes the OpenAlex author record of a researcher.
 *
 * ## What it stores
 *
 * The OpenAlex author payload is wide, and the platform needs different
 * parts of it for different things:
 *
 * - The **counts** go on the profile as columns, because a profile view
 *   reads them every time.
 * - The **observed byline spellings** get their own table, because the
 *   set is what the name-based identity resolution matches against — it
 *   is queried, not displayed.
 * - The **affiliations** get their own table with the years they held.
 *   The years are the point: a year at FPT University is the platform's
 *   business and a year at another institution is not. A single "last
 *   known institution" cannot answer that, and OpenAlex's own "last
 *   known" is the latest authorship rather than the current employment,
 *   so it regularly points at an institution the researcher has left.
 * - The **raw payload** is kept whole in a jsonb snapshot, so the parts
 *   the platform does not model yet — the topics, the yearly counts, the
 *   award links — survive without a migration every time OpenAlex adds
 *   a field.
 *
 * ## Why it is one transaction
 *
 * The four writes describe one record. A half-written record — the
 * counts without the names, the names without the affiliations — is a
 * record that answers some questions wrongly and is worse than no
 * record at all, because the platform cannot tell it is incomplete.
 *
 * ## Why it is idempotent
 *
 * The rows are keyed on the researcher's identity rather than on what
 * the previous fetch said, so a second sync replaces the first instead
 * of accumulating. A name OpenAlex no longer reports is dropped, an
 * affiliation OpenAlex merged away is dropped, and the ones that
 * remain are updated in place.
 */
@Injectable()
export class OpenAlexAuthorRecordService {
  private readonly logger = new Logger(OpenAlexAuthorRecordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: OpenAlexClient,
  ) {}

  /**
   * Fetches the OpenAlex record of an author and stores it.
   *
   * The fetch is outside the transaction: holding a database
   * transaction open across a network call is how a transaction times
   * out.
   */
  async syncAuthorRecord(
    userId: string,
    authorId: string,
  ): Promise<OpenAlexAuthorRecord> {
    const record = await this.client.getAuthorRecord(authorId);
    await this.storeAuthorRecord(userId, record);
    return record;
  }

  /**
   * Stores an already-fetched author record.
   *
   * Split from `syncAuthorRecord` so a caller that already holds the
   * record — the onboarding, which fetched it to show the researcher —
   * does not fetch it twice.
   */
  async storeAuthorRecord(
    userId: string,
    record: OpenAlexAuthorRecord,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.researcher_profiles.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          openalex_author_id: record.shortId,
          ...this.countColumns(record),
          openalex_synced_at: now,
        },
        update: {
          ...this.countColumns(record),
          openalex_synced_at: now,
        },
      });

      await this.writeNames(tx, userId, record, now);
      await this.writeAffiliations(tx, userId, record);
      await this.writeSnapshot(tx, userId, record, now);
    });
  }

  /**
   * The profile columns the record carries.
   *
   * The display name is stored apart from the account name: the account
   * name is what the researcher types and the display name is what the
   * source says, and they differ often enough that overwriting one with
   * the other loses information.
   */
  private countColumns(record: OpenAlexAuthorRecord): {
    openalex_display_name: string | null;
    openalex_works_count: number | null;
    openalex_cited_by_count: number | null;
    openalex_h_index: number | null;
    openalex_i10_index: number | null;
    openalex_2yr_mean_citedness: number | null;
  } {
    return {
      openalex_display_name:
        record.displayName.trim() === '' ? null : record.displayName,
      openalex_works_count: record.counts.worksCount,
      openalex_cited_by_count: record.counts.citedByCount,
      openalex_h_index: record.counts.hIndex,
      openalex_i10_index: record.counts.i10Index,
      openalex_2yr_mean_citedness: record.counts.twoYearMeanCitedness,
    };
  }

  /**
   * Writes the observed byline spellings.
   *
   * The set is replaced rather than merged: a spelling OpenAlex no
   * longer reports is not a spelling the author used, and keeping it
   * would widen the name match with every sync.
   */
  private async writeNames(
    tx: Prisma.TransactionClient,
    userId: string,
    record: OpenAlexAuthorRecord,
    now: Date,
  ): Promise<void> {
    const canonical = record.displayName.trim();

    await tx.researcher_author_names.deleteMany({ where: { user_id: userId } });

    for (const name of record.names) {
      await tx.researcher_author_names.create({
        data: {
          user_id: userId,
          name,
          is_canonical: name === canonical,
          source_updated_at: now,
        },
      });
    }
  }

  /**
   * Writes the affiliations.
   *
   * Also replaced rather than merged, for the same reason. An
   * affiliation OpenAlex merged away — two institutions that turned out
   * to be the same one — would otherwise stay as two rows forever.
   */
  private async writeAffiliations(
    tx: Prisma.TransactionClient,
    userId: string,
    record: OpenAlexAuthorRecord,
  ): Promise<void> {
    await tx.researcher_affiliations.deleteMany({ where: { user_id: userId } });

    const primary = this.primaryInstitution(record.affiliations);

    for (const affiliation of record.affiliations) {
      await tx.researcher_affiliations.create({
        data: {
          user_id: userId,
          institution_id: affiliation.institutionId,
          ror: affiliation.ror,
          name: affiliation.name,
          country_code: affiliation.countryCode,
          institution_type: this.institutionType(affiliation),
          year_start: affiliation.yearStart,
          year_end: affiliation.yearEnd,
          is_primary: affiliation.institutionId === primary,
        },
      });
    }
  }

  /**
   * The affiliation the researcher is at now.
   *
   * The most recent one, by the last year it held. OpenAlex's own
   * "last known institution" is deliberately not used: it is the
   * institution of the latest *authorship*, which for a researcher who
   * moved is the one they left.
   *
   * A tie on the last year is broken by the *first* year: among the
   * affiliations that are still running, the one that started earliest
   * is the home institution, and the others are the co-affiliations of
   * a particular paper. A researcher who was at FPT University from
   * 2020 and at another university for one year in 2026 is at FPT
   * University; both rows end in 2026, and the longer one is the one
   * that says where they work.
   */
  private primaryInstitution(
    affiliations: OpenAlexAffiliation[],
  ): string | null {
    let best: OpenAlexAffiliation | null = null;
    for (const affiliation of affiliations) {
      if (best === null) {
        best = affiliation;
        continue;
      }
      // An affiliation with no end year is still running, so it is the
      // most recent one by definition.
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

  /** The platform's vocabulary for an institution type. */
  private institutionType(
    affiliation: OpenAlexAffiliation,
  ): 'EDUCATION' | 'COMPANY' | 'HEALTHCARE' | 'NONPROFIT' | 'GOVERNMENT' | 'FACILITY' | 'ARCHIVE' | 'OTHER' | null {
    const raw = affiliation.institutionType?.trim().toLowerCase();
    if (!raw) {
      return null;
    }
    return (INSTITUTION_TYPES[raw] ?? 'OTHER') as
      | 'EDUCATION'
      | 'COMPANY'
      | 'HEALTHCARE'
      | 'NONPROFIT'
      | 'GOVERNMENT'
      | 'FACILITY'
      | 'ARCHIVE'
      | 'OTHER';
  }

  /**
   * Writes the raw payload.
   *
   * The snapshot is the whole record as OpenAlex sent it, so the parts
   * the platform does not model yet — the topics, the yearly counts, the
   * award links — survive without a migration every time OpenAlex adds
   * a field.
   */
  private async writeSnapshot(
    tx: Prisma.TransactionClient,
    userId: string,
    record: OpenAlexAuthorRecord,
    now: Date,
  ): Promise<void> {
    await tx.researcher_openalex_snapshots.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        payload: record.raw as never,
        synced_at: now,
      },
      update: {
        payload: record.raw as never,
        synced_at: now,
      },
    });
  }

  /**
   * Reads the stored record of a researcher.
   *
   * The profile counts, the byline spellings and the affiliations, in
   * one read. Used by the profile view and by the identity resolution.
   */
  async readAuthorRecord(userId: string): Promise<{
    profile: {
      openalexAuthorId: string | null;
      openalexDisplayName: string | null;
      openalexWorksCount: number | null;
      openalexCitedByCount: number | null;
      openalexHIndex: number | null;
      openalexI10Index: number | null;
      openalex2yrMeanCitedness: number | null;
      openalexSyncedAt: Date | null;
    } | null;
    names: Array<{ name: string; isCanonical: boolean }>;
    affiliations: Array<{
      institutionId: string;
      ror: string | null;
      name: string;
      countryCode: string | null;
      institutionType: string | null;
      yearStart: number | null;
      yearEnd: number | null;
      isPrimary: boolean;
    }>;
  }> {
    const profile = await this.prisma.researcher_profiles.findUnique({
      where: { user_id: userId },
      select: {
        openalex_author_id: true,
        openalex_display_name: true,
        openalex_works_count: true,
        openalex_cited_by_count: true,
        openalex_h_index: true,
        openalex_i10_index: true,
        openalex_2yr_mean_citedness: true,
        openalex_synced_at: true,
      },
    });

    const [names, affiliations] = await Promise.all([
      this.prisma.researcher_author_names.findMany({
        where: { user_id: userId },
        select: { name: true, is_canonical: true },
        orderBy: { is_canonical: 'desc' },
      }),
      this.prisma.researcher_affiliations.findMany({
        where: { user_id: userId },
        select: {
          institution_id: true,
          ror: true,
          name: true,
          country_code: true,
          institution_type: true,
          year_start: true,
          year_end: true,
          is_primary: true,
        },
        orderBy: [{ is_primary: 'desc' }, { year_end: 'desc' }],
      }),
    ]);

    return {
      profile: profile
        ? {
            openalexAuthorId: profile.openalex_author_id,
            openalexDisplayName: profile.openalex_display_name,
            openalexWorksCount: profile.openalex_works_count,
            openalexCitedByCount: profile.openalex_cited_by_count,
            openalexHIndex: profile.openalex_h_index,
            openalexI10Index: profile.openalex_i10_index,
            openalex2yrMeanCitedness: profile.openalex_2yr_mean_citedness,
            openalexSyncedAt: profile.openalex_synced_at,
          }
        : null,
      names: names.map((row) => ({
        name: row.name,
        isCanonical: row.is_canonical,
      })),
      affiliations: affiliations.map((row) => ({
        institutionId: row.institution_id,
        ror: row.ror,
        name: row.name,
        countryCode: row.country_code,
        institutionType: row.institution_type,
        yearStart: row.year_start,
        yearEnd: row.year_end,
        isPrimary: row.is_primary,
      })),
    };
  }

  /**
   * Reads the raw snapshot of a researcher.
   *
   * The stored payload, for a caller that wants a part the platform does
   * not model yet. Returns null when there is no snapshot.
   */
  async readSnapshot(userId: string): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.researcher_openalex_snapshots.findUnique({
      where: { user_id: userId },
      select: { payload: true },
    });
    if (!row || typeof row.payload !== 'object' || row.payload === null) {
      return null;
    }
    return row.payload as Record<string, unknown>;
  }

  /**
   * Fetches and stores the record, mapping a failure to a domain code.
   *
   * The onboarding calls this when the researcher confirms their author,
   * and a failure to record it must not fail the onboarding: the record
   * is an enrichment, and the profile itself is what the researcher came
   * for.
   */
  async trySyncAuthorRecord(
    userId: string,
    authorId: string,
  ): Promise<OpenAlexAuthorRecord | null> {
    try {
      return await this.syncAuthorRecord(userId, authorId);
    } catch (error) {
      if (error instanceof CodedHttpException) {
        if (error.getStatus() === HttpStatus.NOT_FOUND) {
          throw error;
        }
      }
      this.logger.warn(
        `Could not store the OpenAlex author record for ${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }
}
