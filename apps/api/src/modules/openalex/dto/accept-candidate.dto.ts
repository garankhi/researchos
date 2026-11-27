import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/**
 * How much of the platform a researcher may see about an accepted work.
 *
 * `PRIVATE` keeps the work as the owner's own working copy — a draft
 * nobody else can read. `FPTU_COMMUNITY` publishes it to every signed-in
 * researcher.
 *
 * A personal work has no third option: `CONTAINER` is for a work owned
 * by a group or a project, and the platform decides that at creation.
 */
export enum CandidateVisibility {
  PRIVATE = 'PRIVATE',
  FPTU_COMMUNITY = 'FPTU_COMMUNITY',
}

/**
 * The body of a candidate accept.
 *
 * Accepting is a validation act — it claims the work for the researcher.
 * Publishing is a separate act, and this body decides whether the accept
 * also publishes.
 *
 * The default is `PRIVATE`: the work becomes the researcher's own
 * working copy, and they publish it themselves when they are ready. The
 * choice is optional so an accept without a body keeps that default.
 */
export class AcceptCandidateDto {
  @ApiPropertyOptional({
    description:
      'Who may see the work after the accept. PRIVATE keeps it as the researcher’s own working copy; FPTU_COMMUNITY publishes it to every signed-in researcher. Defaults to PRIVATE.',
    enum: CandidateVisibility,
    default: CandidateVisibility.PRIVATE,
    example: CandidateVisibility.PRIVATE,
  })
  @IsOptional()
  @IsIn([CandidateVisibility.PRIVATE, CandidateVisibility.FPTU_COMMUNITY], {
    message: 'output_visibility_invalid',
  })
  visibility?: CandidateVisibility;
}
