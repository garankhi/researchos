import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The body of a pull trigger.
 *
 * The pull resolves the researcher itself, from the session and the
 * profile. The body carries the *choice* the researcher made during
 * onboarding — which OpenAlex author is theirs — and nothing else.
 *
 * Leaving the body empty pulls with whatever the profile already
 * resolves to: the confirmed OpenAlex author id, the ORCID, or the name
 * fallback.
 */
export class PullOpenAlexWorksDto {
  @ApiPropertyOptional({
    description:
      'The OpenAlex author id the researcher picked during onboarding. Recorded on the profile, so every later pull resolves through it. Ignored when the profile already carries a confirmed id.',
    example: 'A5023888391',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  openAlexAuthorId?: string;
}
