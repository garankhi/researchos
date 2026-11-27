import { ApiProperty } from '@nestjs/swagger';

/**
 * The counts OpenAlex reports for a researcher.
 *
 * The two popularity measures answer different questions, and both are
 * exposed: the h-index is career-lifetime, so it favours a long career
 * over a hot recent topic, while the two-year mean is recency-weighted,
 * so it says how much the author is cited *now*.
 */
export class OpenAlexCountsDto {
  @ApiProperty({
    description: 'Total works OpenAlex attributes to the author.',
    example: 313,
    type: 'integer',
    nullable: true,
  })
  worksCount: number | null;

  @ApiProperty({
    description: 'Total citations to those works.',
    example: 14816,
    type: 'integer',
    nullable: true,
  })
  citedByCount: number | null;

  @ApiProperty({
    description:
      'The h-index. Career-lifetime, so it favours a long career over a hot recent topic.',
    example: 56,
    type: 'integer',
    nullable: true,
  })
  hIndex: number | null;

  @ApiProperty({
    description: 'The number of works with at least ten citations.',
    example: 166,
    type: 'integer',
    nullable: true,
  })
  i10Index: number | null;

  @ApiProperty({
    description:
      'The mean citations per work over the last two years. Recency-weighted.',
    example: 12.304,
    type: 'number',
    nullable: true,
  })
  twoYearMeanCitedness: number | null;
}

/**
 * One institution a researcher was affiliated with.
 *
 * The year range is exposed because it is what makes an affiliation
 * decidable: a year at FPT University is the platform's business and a
 * year at another institution is not.
 */
export class OpenAlexAffiliationDto {
  @ApiProperty({
    description: 'The OpenAlex institution id.',
    example: 'I109689652',
  })
  institutionId: string;

  @ApiProperty({
    description:
      'The ROR id of the same institution. It survives the renames and merges that break a display name.',
    example: 'https://ror.org/03esj4g97',
    type: 'string',
    nullable: true,
  })
  ror: string | null;

  @ApiProperty({
    description: 'The institution display name.',
    example: 'FPT University',
  })
  name: string;

  @ApiProperty({
    description: 'The ISO country code.',
    example: 'VN',
    type: 'string',
    nullable: true,
  })
  countryCode: string | null;

  @ApiProperty({
    description:
      'The kind of institution: EDUCATION, COMPANY, HEALTHCARE, NONPROFIT, GOVERNMENT, FACILITY, ARCHIVE or OTHER.',
    example: 'EDUCATION',
    type: 'string',
    nullable: true,
  })
  institutionType: string | null;

  @ApiProperty({
    description: 'The first year the affiliation held.',
    example: 2023,
    type: 'integer',
    nullable: true,
  })
  yearStart: number | null;

  @ApiProperty({
    description: 'The last year the affiliation held.',
    example: 2023,
    type: 'integer',
    nullable: true,
  })
  yearEnd: number | null;

  @ApiProperty({
    description:
      'Whether this is the affiliation the researcher is at now — the most recent one by year.',
    example: true,
  })
  isPrimary: boolean;
}

/**
 * The OpenAlex record of a researcher.
 *
 * The counts, the byline spellings OpenAlex has observed and the
 * affiliations with their years. The raw payload is not exposed: it is
 * the source's shape, not the platform's, and it changes whenever
 * OpenAlex adds a field.
 */
export class OpenAlexAuthorRecordResponseDto {
  @ApiProperty({
    description: 'The canonical OpenAlex author id.',
    example: 'https://openalex.org/A5027558961',
    type: 'string',
    nullable: true,
  })
  authorId: string | null;

  @ApiProperty({
    description: 'The canonical display name OpenAlex holds for the author.',
    example: 'Nguyen Hoang Khoi Tran',
    type: 'string',
    nullable: true,
  })
  displayName: string | null;

  @ApiProperty({
    description: 'The counts OpenAlex reports for the author.',
    type: OpenAlexCountsDto,
  })
  counts: OpenAlexCountsDto;

  @ApiProperty({
    description:
      'Every byline spelling OpenAlex has observed for the author. The set is what the name-based identity resolution matches against.',
    example: ['Nguyen Hoang Khoi Tran', 'N. H. Tran', 'Tran, Nguyen H'],
    type: [String],
  })
  names: string[];

  @ApiProperty({
    description: 'The institutions the author was affiliated with.',
    type: [OpenAlexAffiliationDto],
  })
  affiliations: OpenAlexAffiliationDto[];

  @ApiProperty({
    description: 'When the record was last fetched.',
    example: '2026-11-27T10:00:31.000Z',
    type: 'string',
    nullable: true,
  })
  syncedAt: string | null;
}
