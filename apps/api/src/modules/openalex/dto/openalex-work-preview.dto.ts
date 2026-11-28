import { ApiProperty } from '@nestjs/swagger';

/**
 * One work OpenAlex has for the researcher.
 *
 * The live preview, before the work is pulled into the platform. It is
 * what the onboarding step and the "fetch new works" button show.
 */
export class OpenAlexWorkPreviewDto {
  @ApiProperty({
    description:
      'Canonical OpenAlex id of the work, e.g. https://openalex.org/W2741809807.',
    example: 'https://openalex.org/W2741809807',
  })
  workId: string;

  @ApiProperty({
    description: 'Short OpenAlex id of the work, e.g. W2741809807.',
    example: 'W2741809807',
  })
  shortId: string;

  @ApiProperty({
    description: 'Title of the work.',
    example: 'A study of collaborative reading strategies',
  })
  title: string;

  @ApiProperty({
    description: 'Normalised DOI of the work, or null when it has none.',
    type: String,
    nullable: true,
    example: '10.1234/example',
  })
  doi: string | null;

  @ApiProperty({
    description:
      'Publication year of the work, or null when OpenAlex reports none.',
    type: Number,
    nullable: true,
    example: 2024,
  })
  publicationYear: number | null;

  @ApiProperty({
    description: 'Platform output-type vocabulary of the work.',
    example: 'ARTICLE',
  })
  outputType: string;

  @ApiProperty({
    description: 'Venue of the work, or null when OpenAlex reports none.',
    type: String,
    nullable: true,
    example: 'Journal of Applied Research',
  })
  venue: string | null;

  @ApiProperty({
    description:
      'Abstract of the work, or null when OpenAlex reports none. OpenAlex stores abstracts as an inverted index, so this is the reconstructed text.',
    type: String,
    nullable: true,
    example: 'This study examines collaborative reading strategies…',
  })
  abstract: string | null;

  @ApiProperty({
    description:
      'Author display names of the work, in byline order. Empty when OpenAlex reports no authorship.',
    type: [String],
    example: ['Nguyen Van An', 'Tran Thi B'],
  })
  authors: string[];

  @ApiProperty({
    description:
      'Landing page URL of the work, or null when OpenAlex provides none.',
    type: String,
    nullable: true,
    example: 'https://doi.org/10.1234/example',
  })
  url: string | null;

  @ApiProperty({
    description:
      'Whether the work was resolved through a confirmed identifier. A name-only result is never confirmed.',
    example: false,
  })
  confirmed: boolean;
}
