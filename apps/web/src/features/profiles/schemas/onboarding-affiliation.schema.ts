import type {
  OnboardingAffiliationDto,
  OnboardingAffiliationDtoInstitutionType,
} from '@/lib/api/models';

/**
 * The affiliation timeline's rules.
 *
 * The timeline is editable, and an editable timeline has rules the rest
 * of the OpenAlex record does not: a row needs a name to be stored, its
 * years have to be plausible, and its end year must not precede its
 * start. They live here rather than in the component, because they are
 * rules rather than a view — and a rule that is only expressed in a
 * component can only be checked by rendering the component.
 */

/**
 * The earliest year an affiliation may start.
 *
 * The bound mirrors the backend's own: a year before the tenth century
 * is a typo rather than a career.
 */
export const AFFILIATION_MIN_YEAR = 1000;

/**
 * The latest year an affiliation may end.
 *
 * One year past the current one, because a researcher may already have
 * signed a contract for next year.
 */
export const AFFILIATION_MAX_YEAR = new Date().getFullYear() + 1;

/**
 * The institution types OpenAlex reports.
 *
 * OpenAlex writes them in lower case and the platform stores them in
 * upper case, so the list is mapped rather than upper-cased blindly —
 * an unknown kind becomes `OTHER`, exactly as the backend maps it when
 * it writes a row of its own.
 */
const INSTITUTION_TYPES: Record<
  string,
  OnboardingAffiliationDtoInstitutionType
> = {
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
 * The institution kind of an OpenAlex affiliation, in the platform's
 * vocabulary.
 */
export function openAlexInstitutionType(
  value: string | null | undefined,
): OnboardingAffiliationDtoInstitutionType {
  if (!value) {
    return null;
  }
  return INSTITUTION_TYPES[value.trim().toLowerCase()] ?? 'OTHER';
}

/**
 * A year an input holds, as a number.
 *
 * An empty field means the year is unknown, and a year that is not a
 * number is unknown as well — the researcher is still typing, and the
 * backend refuses an absurd year anyway.
 */
export function affiliationYear(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

/**
 * Whether a year is one the backend would accept.
 *
 * The range mirrors the backend's own, so the researcher learns about it
 * next to the input rather than from a rejected request.
 */
export function isPlausibleAffiliationYear(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return true;
  }
  if (!/^\d{1,4}$/.test(trimmed)) {
    return false;
  }
  const year = Number(trimmed);
  return year >= AFFILIATION_MIN_YEAR && year <= AFFILIATION_MAX_YEAR;
}

/**
 * The fields of an affiliation row the researcher edits.
 */
export interface AffiliationEditableRow {
  /** The institution name, as the researcher spells it. */
  name: string;
  /** The first year, as typed. Empty means unknown. */
  yearStart: string;
  /** The last year, as typed. Empty means still running. */
  yearEnd: string;
}

/**
 * Why a row cannot be stored, or null when it can.
 *
 * The reasons are ordered so the researcher is told about the first
 * thing that has to be fixed.
 *
 * The code is the reason, not the sentence: the sentence is the
 * catalog's, and the catalog is what changes when the wording does.
 */
export type AffiliationProblem =
  | 'affiliation_name_required'
  | 'affiliation_year_start_invalid'
  | 'affiliation_year_end_invalid'
  | 'onboarding_affiliation_years_invalid';

/**
 * The problem with a row, or null when the row can be stored.
 *
 * The year *order* is a relation between two fields, so it is checked
 * on the row rather than on either field.
 */
export function affiliationRowProblem(
  row: AffiliationEditableRow,
): AffiliationProblem | null {
  if (row.name.trim() === '') {
    return 'affiliation_name_required';
  }
  if (!isPlausibleAffiliationYear(row.yearStart)) {
    return 'affiliation_year_start_invalid';
  }
  if (!isPlausibleAffiliationYear(row.yearEnd)) {
    return 'affiliation_year_end_invalid';
  }

  const start = affiliationYear(row.yearStart);
  const end = affiliationYear(row.yearEnd);
  if (start !== null && end !== null && end < start) {
    return 'onboarding_affiliation_years_invalid';
  }

  return null;
}

/**
 * Whether a row can be stored.
 */
export function isStorableAffiliation(row: AffiliationEditableRow): boolean {
  return affiliationRowProblem(row) === null;
}

/**
 * Whether two timelines hold the same rows, in the same order.
 *
 * The comparison is on the values the payload carries, so a change that
 * does not reach the server is not a change at all.
 */
export function sameAffiliationValues(
  left: OnboardingAffiliationDto[],
  right: OnboardingAffiliationDto[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((row, index) => {
    const other = right[index];
    return (
      row.institutionId === other.institutionId &&
      row.name === other.name &&
      (row.ror ?? null) === (other.ror ?? null) &&
      (row.countryCode ?? null) === (other.countryCode ?? null) &&
      (row.institutionType ?? null) === (other.institutionType ?? null) &&
      (row.yearStart ?? null) === (other.yearStart ?? null) &&
      (row.yearEnd ?? null) === (other.yearEnd ?? null)
    );
  });
}
