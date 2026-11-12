import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The two answers an opportunity owner may give.
 *
 * `PENDING` and `WITHDRAWN` are not answers: the first is the state every
 * application starts in, and the second is the applicant's own withdrawal.
 * Only the two terminal owner decisions are accepted here.
 */
export const ApplicationDecision = {
  INVITED_TO_DISCUSS: 'INVITED_TO_DISCUSS',
  DECLINED: 'DECLINED',
} as const;

/**
 * The owner's answer to a pending application.
 *
 * The decision itself is server-owned — it is one of the two statuses the
 * owner may set — and the note is free text the owner writes for the
 * applicant.
 */
export class RespondApplicationDto {
  @ApiProperty({
    description:
      "The owner's answer: invite the applicant to a discussion, or decline.",
    enum: ApplicationDecision,
  })
  @IsEnum(ApplicationDecision)
  decision: (typeof ApplicationDecision)[keyof typeof ApplicationDecision];

  @ApiPropertyOptional({
    description:
      'Note the owner writes for the applicant, explaining the decision.',
    type: String,
    nullable: true,
    maxLength: 10000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  responseNote?: string | null;
}
