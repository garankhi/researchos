import { ApiProperty } from '@nestjs/swagger';

/**
 * The citation metrics OpenAlex reports for an author.
 *
 * They are the fastest recognition cue there is: an h-index of 40 and
 * an h-index of 2 are two different people wearing the same name.
 */
export class OpenAlexAuthorCountsDto {
  @ApiProperty({
    description: 'Total works OpenAlex attributes to the author.',
    type: Number,
    nullable: true,
    example: 42,
  })
  worksCount: number | null;

  @ApiProperty({
    description: 'Total citations to those works.',
    type: Number,
    nullable: true,
    example: 318,
  })
  citedByCount: number | null;

  @ApiProperty({
    description: 'The h-index of the author.',
    type: Number,
    nullable: true,
    example: 7,
  })
  hIndex: number | null;

  @ApiProperty({
    description: 'The number of works with at least ten citations.',
    type: Number,
    nullable: true,
    example: 4,
  })
  i10Index: number | null;

  @ApiProperty({
    description: 'The mean citations per work over the last two years.',
    type: Number,
    nullable: true,
    example: 2.5,
  })
  twoYearMeanCitedness: number | null;
}

/**
 * One topic OpenAlex assigned to an author.
 */
export class OpenAlexAuthorTopicDto {
  @ApiProperty({
    description: 'The OpenAlex topic id, e.g. T11409.',
    example: 'T11409',
  })
  id: string;

  @ApiProperty({
    description: 'The topic display name.',
    example: 'Natural Language Processing Techniques',
  })
  name: string;

  @ApiProperty({
    description:
      'How many of the author’s works sit in the topic. Null when OpenAlex reports no count.',
    type: Number,
    nullable: true,
    example: 3,
  })
  count: number | null;
}

/**
 * One affiliation of an author, with the years it held.
 *
 * The years are the point: a year at FPT University is the platform’s
 * business and a year at another institution is not.
 */
export class OpenAlexAffiliationDto {
  @ApiProperty({
    description: 'The OpenAlex institution id, e.g. I109689652.',
    example: 'I109689652',
  })
  institutionId: string;

  @ApiProperty({
    description: 'The institution display name.',
    example: 'FPT University',
  })
  name: string;

  @ApiProperty({
    description:
      'The ROR id of the institution, when OpenAlex knows one. It is carried through so an affiliation the researcher edits keeps its identity: the id is the key the affiliation is stored under.',
    type: String,
    nullable: true,
    example: 'https://ror.org/03esj4g97',
  })
  ror: string | null;

  @ApiProperty({
    description: 'The ISO country code of the institution.',
    type: String,
    nullable: true,
    example: 'VN',
  })
  countryCode: string | null;

  @ApiProperty({
    description:
      'The kind of institution: education, company, healthcare, nonprofit, government, facility, archive or other.',
    type: String,
    nullable: true,
    example: 'education',
  })
  institutionType: string | null;

  @ApiProperty({
    description: 'The first year the affiliation held.',
    type: Number,
    nullable: true,
    example: 2020,
  })
  yearStart: number | null;

  @ApiProperty({
    description: 'The last year the affiliation held.',
    type: Number,
    nullable: true,
    example: 2026,
  })
  yearEnd: number | null;
}

/**
 * One of an author’s recent works, as the recognition panel shows it.
 */
export class OpenAlexAuthorRecentWorkDto {
  @ApiProperty({
    description: 'Canonical OpenAlex id of the work.',
    example: 'https://openalex.org/W2741809807',
  })
  workId: string;

  @ApiProperty({
    description: 'Short OpenAlex id of the work, e.g. W2741809807.',
    example: 'W2741809807',
  })
  shortId: string;

  @ApiProperty({
    description: 'The work title.',
    example: 'How Exposed Are LLM Email Agents to Indirect Prompt Injection',
  })
  title: string;

  @ApiProperty({
    description: 'The publication year, when OpenAlex reports one.',
    type: Number,
    nullable: true,
    example: 2026,
  })
  publicationYear: number | null;

  @ApiProperty({
    description: 'The venue the work was published in.',
    type: String,
    nullable: true,
    example: 'Symmetry',
  })
  venue: string | null;

  @ApiProperty({
    description:
      'The institution recorded on the authorship of the author this work is listed under. Null when OpenAlex recorded none.',
    type: String,
    nullable: true,
    example: 'FPT University',
  })
  affiliation: string | null;
}

/**
 * One OpenAlex author the researcher might be.
 *
 * Returned by the author-discovery route when the researcher has no
 * confirmed OpenAlex id yet. It is a suggestion, never an assertion: the
 * researcher ticks the one that is theirs, and only then does the
 * platform record the id.
 *
 * ## Why the candidate carries so much
 *
 * A Vietnamese name is not a unique identifier — a dozen researchers
 * share one, and OpenAlex merges profiles that carry the same byline.
 * The name alone therefore cannot tell the researcher which profile is
 * theirs; the citation metrics, the byline spellings, the topics, the
 * affiliation history and the recent works can. They are what the
 * recognition panel shows next to the list.
 */
export class OpenAlexAuthorCandidateDto {
  @ApiProperty({
    description:
      'Canonical OpenAlex id of the author, e.g. https://openalex.org/A5023888391.',
    example: 'https://openalex.org/A5023888391',
  })
  id: string;

  @ApiProperty({
    description: 'Short OpenAlex id of the author, e.g. A5023888391.',
    example: 'A5023888391',
  })
  shortId: string;

  @ApiProperty({
    description: 'Display name of the author as OpenAlex records it.',
    example: 'Nguyen Van An',
  })
  displayName: string;

  @ApiProperty({
    description:
      'ORCID of the author, or null when OpenAlex knows none. A non-null ORCID is a strong signal that this is the researcher.',
    type: String,
    nullable: true,
    example: 'https://orcid.org/0000-0002-1825-0097',
  })
  orcid: string | null;

  @ApiProperty({
    description:
      'Number of works OpenAlex records for the author, or null when it reports none.',
    type: Number,
    nullable: true,
    example: 42,
  })
  worksCount: number | null;

  @ApiProperty({
    description:
      'Institution display names from the author’s last known affiliations.',
    type: [String],
  })
  affiliations: string[];

  @ApiProperty({
    description:
      'Whether the author is affiliated with FPT University, the one affiliation in scope.',
    example: true,
  })
  affiliationMatch: boolean;

  @ApiProperty({
    description:
      'The citation metrics OpenAlex reports for the author. The fastest cue for telling two namesakes apart.',
    type: OpenAlexAuthorCountsDto,
  })
  counts: OpenAlexAuthorCountsDto;

  @ApiProperty({
    description:
      'The byline spellings OpenAlex has observed for the author, apart from the display name. A researcher who published under a different spelling recognises it immediately.',
    type: [String],
    example: ['Nguyen, Hoang Khoi Tran', 'HOANG KHOI TRAN NGUYEN'],
  })
  nameVariants: string[];

  @ApiProperty({
    description:
      'Every ORCID seen across the author’s workships, apart from the canonical one.',
    type: [String],
  })
  observedOrcids: string[];

  @ApiProperty({
    description:
      'The topics OpenAlex assigned to the author, most prolific first. The research area is what tells a namesake in another field apart.',
    type: [OpenAlexAuthorTopicDto],
  })
  topics: OpenAlexAuthorTopicDto[];

  @ApiProperty({
    description:
      'The affiliations of the author with the years they held, newest last.',
    type: [OpenAlexAffiliationDto],
  })
  affiliationHistory: OpenAlexAffiliationDto[];

  @ApiProperty({
    description:
      'The most recent works OpenAlex records for the author, newest first. The panel shows these so the researcher can recognise their own papers.',
    type: [OpenAlexAuthorRecentWorkDto],
  })
  recentWorks: OpenAlexAuthorRecentWorkDto[];
}

/**
 * The author candidates the platform found for a researcher.
 *
 * The mode says which tier produced the list: `AUTHOR_ID` and `ORCID`
 * resolved through a confirmed identifier and carry the single author the
 * platform knows, `NAME` is the fallback list for a researcher with no
 * OpenAlex and no ORCID profile.
 */
export class OpenAlexAuthorCandidatesDto {
  @ApiProperty({
    description:
      'How the list was produced: AUTHOR_ID and ORCID resolved through a confirmed identifier, NAME through the byline name.',
    enum: ['AUTHOR_ID', 'ORCID', 'NAME'],
    example: 'NAME',
  })
  mode: 'AUTHOR_ID' | 'ORCID' | 'NAME';

  @ApiProperty({
    description:
      'The author candidates. Empty in the NAME mode when the researcher’s name is blank.',
    type: [OpenAlexAuthorCandidateDto],
  })
  authors: OpenAlexAuthorCandidateDto[];
}
