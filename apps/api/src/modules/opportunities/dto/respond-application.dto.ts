import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export const ApplicationDecision = {
  INVITED_TO_DISCUSS: 'INVITED_TO_DISCUSS',
  DECLINED: 'DECLINED',
  ACCEPTED: 'ACCEPTED',
} as const;

export class RespondApplicationDto {
  @ApiProperty({
    description:
      "The owner's answer: invite the applicant to a discussion, decline, or accept.",
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
