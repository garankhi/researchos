import { ApiProperty } from '@nestjs/swagger';

/**
 * One OpenAlex author the researcher might be.
 *
 * Returned by the author-discovery route when the researcher has no
 * confirmed OpenAlex id yet. It is a suggestion, never an assertion: the
 * researcher ticks the one that is theirs, and only then does the
 * platform record the id.
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
