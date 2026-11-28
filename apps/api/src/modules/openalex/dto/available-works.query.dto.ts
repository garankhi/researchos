import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The query of the works-preview route.
 *
 * The author id is optional: without it, the preview resolves the
 * researcher through the confirmed chain — the OpenAlex author id on
 * the profile, then the ORCID, then the byline name. With it, the
 * preview uses that author, which is the onboarding step where the
 * researcher picked one from the candidate list.
 */
export class AvailableWorksQueryDto {
  @ApiPropertyOptional({
    description:
      'The OpenAlex author to preview the works of. Defaults to the researcher’s own confirmed author.',
    example: 'A5023888391',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  authorId?: string;
}
