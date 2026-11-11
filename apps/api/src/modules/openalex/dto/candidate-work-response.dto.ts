import { ApiProperty } from '@nestjs/swagger';
import { ClaimStatus } from '@researchos/database';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';

/**
 * One stored OpenAlex candidate awaiting the researcher's decision.
 *
 * This is a read of the stored candidate, not of OpenAlex: the ingest
 * (RES-137) persisted the work with `import_state = 'CANDIDATE'`,
 * `owner_id = NULL` and `sharing_status = 'DRAFT'`, and the claim write
 * (RES-155) added the `SUGGESTED` claim that makes it visible here. The
 * title, abstract, venue and authors come from the editable draft
 * revision; the OpenAlex id comes from the external-id link.
 */
export class CandidateWorkDto {
  @ApiProperty({
    description: 'Identifier of the stored candidate work.',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description:
      'Canonical OpenAlex id of the candidate, or null when the external-id link is missing.',
    type: String,
    nullable: true,
  })
  openalexId: string | null;

  @ApiProperty({
    description: 'Normalised DOI of the candidate, or null when it has none.',
    type: String,
    nullable: true,
  })
  doi: string | null;

  @ApiProperty({ description: 'Title of the candidate work.' })
  title: string;

  @ApiProperty({
    description: 'Abstract of the candidate work, or null when it has none.',
    type: String,
    nullable: true,
  })
  abstract: string | null;

  @ApiProperty({
    description: 'Venue of the candidate work, or null when it has none.',
    type: String,
    nullable: true,
  })
  venue: string | null;

  @ApiProperty({
    description:
      'Publication year of the candidate work, or null when it has none.',
    type: Number,
    nullable: true,
  })
  publicationYear: number | null;

  @ApiProperty({
    description: 'Platform output-type vocabulary of the candidate work.',
  })
  outputType: string;

  @ApiProperty({
    description:
      'Landing page URL of the candidate work, or null when OpenAlex provided none.',
    type: String,
    nullable: true,
  })
  url: string | null;

  @ApiProperty({
    description: 'Author display names of the candidate work, in order.',
    type: [String],
  })
  authors: string[];

  @ApiProperty({
    description:
      'Claim status of the caller on this candidate, or null when the caller pulled it without a claim.',
    enum: ClaimStatus,
    nullable: true,
  })
  claimStatus: ClaimStatus | null;

  @ApiProperty({
    description:
      'How the work was matched to the researcher, or null when there is no claim.',
    type: String,
    nullable: true,
  })
  matchSource: string | null;
}

/**
 * One page of stored OpenAlex candidates.
 */
export class PaginatedCandidateWorksResponseDto extends PaginatedResultDto<CandidateWorkDto> {
  @ApiProperty({
    description: 'The stored candidates of this page.',
    type: [CandidateWorkDto],
  })
  declare items: CandidateWorkDto[];
}

/**
 * How many stored candidates still await the researcher's decision.
 *
 * This is the cheap part of the surface: it answers without the full
 * list, so the entry card can render before the pull runs.
 */
export class CandidateWorksCountDto {
  @ApiProperty({
    description:
      'Number of stored candidates left for the caller, excluding works the caller already accepted or rejected.',
    example: 3,
  })
  count: number;
}
