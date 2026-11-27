import { ApiProperty } from '@nestjs/swagger';

/**
 * The citation metrics OpenAlex holds for a researcher.
 *
 * Every field is nullable, and a null is not a zero: "no h-index" and
 * "an h-index of zero" are different facts, and the second is a claim
 * the platform cannot make. The metrics only exist once the researcher
 * has confirmed their OpenAlex author, so a profile without that
 * confirmation reports the whole block as absent.
 */
export class ProfileCitationMetricsDto {
  @ApiProperty({
    description: 'Total works OpenAlex attributes to the researcher.',
    example: 47,
    type: 'integer',
    nullable: true,
  })
  worksCount: number | null;

  @ApiProperty({
    description: 'Total citations to those works.',
    example: 1712,
    type: 'integer',
    nullable: true,
  })
  citedByCount: number | null;

  @ApiProperty({
    description: 'The h-index of the researcher.',
    example: 19,
    type: 'integer',
    nullable: true,
  })
  hIndex: number | null;

  @ApiProperty({
    description: 'The number of works with at least ten citations.',
    example: 23,
    type: 'integer',
    nullable: true,
  })
  i10Index: number | null;
}
