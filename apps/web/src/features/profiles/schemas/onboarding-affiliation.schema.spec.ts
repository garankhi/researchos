import { describe, expect, it } from 'vitest';
import {
  AFFILIATION_MAX_YEAR,
  AFFILIATION_MIN_YEAR,
  affiliationRowProblem,
  affiliationYear,
  isPlausibleAffiliationYear,
  isStorableAffiliation,
  openAlexInstitutionType,
  sameAffiliationValues,
} from './onboarding-affiliation.schema';

describe('the affiliation timeline rules', () => {
  it('maps OpenAlex’s institution kinds onto the platform’s vocabulary', () => {
    expect(openAlexInstitutionType('education')).toBe('EDUCATION');
    expect(openAlexInstitutionType('Company')).toBe('COMPANY');
    expect(openAlexInstitutionType('nonprofit')).toBe('NONPROFIT');
    expect(openAlexInstitutionType(null)).toBeNull();
    expect(openAlexInstitutionType(undefined)).toBeNull();
  });

  it('maps an institution kind the platform does not know to OTHER', () => {
    // OpenAlex adds kinds over time, and the platform stores them
    // anyway: an imprecise kind is more useful than no row.
    expect(openAlexInstitutionType('space_agency')).toBe('OTHER');
  });

  it('reads an empty year as an unknown year', () => {
    // An empty end year is what "still there" means, and the server
    // reads a null end year that way.
    expect(affiliationYear('')).toBeNull();
    expect(affiliationYear('   ')).toBeNull();
    expect(affiliationYear('2020')).toBe(2020);
  });

  it('refuses a row without a name', () => {
    // The backend refuses it, and it refuses the whole payload when it
    // refuses a row.
    expect(
      affiliationRowProblem({
        name: '   ',
        yearStart: '2020',
        yearEnd: '2026',
      }),
    ).toBe('affiliation_name_required');
    expect(
      isStorableAffiliation({
        name: '   ',
        yearStart: '2020',
        yearEnd: '2026',
      }),
    ).toBe(false);
  });

  it('refuses a row that ends before it starts', () => {
    // The year order is a relation between two fields, so it is checked
    // on the row rather than on either field.
    expect(
      affiliationRowProblem({
        name: 'FPT University',
        yearStart: '2026',
        yearEnd: '2020',
      }),
    ).toBe('onboarding_affiliation_years_invalid');
  });

  it('refuses a year outside the plausible range', () => {
    expect(isPlausibleAffiliationYear('900')).toBe(false);
    expect(isPlausibleAffiliationYear('9999')).toBe(false);
    expect(
      affiliationRowProblem({
        name: 'FPT University',
        yearStart: '2020',
        yearEnd: '9999',
      }),
    ).toBe('affiliation_year_end_invalid');
    expect(
      affiliationRowProblem({
        name: 'FPT University',
        yearStart: '900',
        yearEnd: '',
      }),
    ).toBe('affiliation_year_start_invalid');
  });

  it('accepts the range the backend accepts', () => {
    expect(isPlausibleAffiliationYear(String(AFFILIATION_MIN_YEAR))).toBe(true);
    expect(isPlausibleAffiliationYear(String(AFFILIATION_MAX_YEAR))).toBe(true);
  });

  it('accepts a running affiliation, whose end year is empty', () => {
    expect(
      isStorableAffiliation({
        name: 'FPT University',
        yearStart: '2020',
        yearEnd: '',
      }),
    ).toBe(true);
  });

  it('accepts a row whose start year is unknown', () => {
    expect(
      isStorableAffiliation({
        name: 'FPT University',
        yearStart: '',
        yearEnd: '2026',
      }),
    ).toBe(true);
  });

  it('tells two timelines apart only when the payload differs', () => {
    const row = {
      institutionId: 'I109689652',
      name: 'FPT University',
      ror: null,
      countryCode: 'VN',
      institutionType: 'EDUCATION' as const,
      yearStart: 2020,
      yearEnd: null,
    };

    expect(sameAffiliationValues([row], [{ ...row }])).toBe(true);
    expect(sameAffiliationValues([row], [{ ...row, name: 'FPT' }])).toBe(false);
    expect(sameAffiliationValues([row], [{ ...row, yearEnd: 2026 }])).toBe(
      false,
    );
    expect(sameAffiliationValues([row], [])).toBe(false);
  });
});
