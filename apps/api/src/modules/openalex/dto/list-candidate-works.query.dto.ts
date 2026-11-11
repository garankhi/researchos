import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Query parameters for paging the stored OpenAlex candidates.
 *
 * The paging is over the stored candidates, not over OpenAlex: the OpenAlex
 * paging happens in the lookup (RES-134) and the pull that fills the table
 * is the ingest job (RES-137). No sort key — the list always returns the
 * most recently pulled candidates first.
 */
export class ListCandidateWorksQueryDto {
  @ApiProperty({
    description: 'Page number, 1-based.',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({
    description: 'How many records one page holds.',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
