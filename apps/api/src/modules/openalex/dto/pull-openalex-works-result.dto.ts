import { ApiProperty } from '@nestjs/swagger';

/**
 * The result of a pull.
 *
 * How the works were resolved, and what the pull did with them. The
 * counts let the UI say "12 works pulled, 3 already known" without a
 * second round trip.
 */
export class PullOpenAlexWorksResultDto {
  @ApiProperty({
    description:
      'How the works were resolved: AUTHOR_ID through the confirmed OpenAlex author id, ORCID through the ORCID, NAME through the byline name and the FPT University affiliation.',
    enum: ['AUTHOR_ID', 'ORCID', 'NAME'],
    example: 'NAME',
  })
  mode: 'AUTHOR_ID' | 'ORCID' | 'NAME';

  @ApiProperty({
    description:
      'The OpenAlex author id the pull resolved to, or null when the name fallback resolved no author.',
    type: String,
    nullable: true,
    example: 'A5023888391',
  })
  authorId: string | null;

  @ApiProperty({
    description: 'How many works OpenAlex returned.',
    example: 12,
  })
  worksScanned: number;

  @ApiProperty({
    description: 'How many of those works became new candidates.',
    example: 9,
  })
  candidatesCreated: number;

  @ApiProperty({
    description:
      'How many of those works were already stored — a re-pull of a known work never duplicates it.',
    example: 3,
  })
  candidatesExisting: number;
}
