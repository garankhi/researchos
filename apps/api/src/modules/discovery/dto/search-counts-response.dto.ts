import { ApiProperty } from '@nestjs/swagger';

/**
 * Per-tab result counts for one search term (`GET /search/counts`).
 *
 * The keys are the `SearchTab` values, so the frontend can index the object
 * by the tab it is rendering without translating anything. Every count is
 * permission-filtered exactly like the results it counts: a caller never
 * sees a total for a slice they cannot read.
 */
export class SearchCountsResponseDto {
  @ApiProperty({
    description:
      'Number of matching research outputs visible to the caller (the `research` tab).',
    example: 12,
  })
  research: number;

  @ApiProperty({
    description:
      'Number of matching researcher profiles visible to the caller (the `people` tab).',
    example: 3,
  })
  people: number;

  @ApiProperty({
    description:
      'Number of matching research groups visible to the caller (the `group` tab).',
    example: 2,
  })
  group: number;

  @ApiProperty({
    description:
      'Number of matching opportunities visible to the caller (the `opportunity` tab).',
    example: 7,
  })
  opportunity: number;
}
