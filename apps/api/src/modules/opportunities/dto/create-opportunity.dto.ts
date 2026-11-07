import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OpportunityKind,
  OpportunityStatus,
  TargetAudience,
} from '@researchos/database';
import {
  Equals,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateOpportunityDto {
  @ApiPropertyOptional({
    description:
      'Optional group scope; caller must be its lead or core member.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  @ValidateIf((_o, value) => value != null)
  @IsUUID()
  groupId?: string | null;

  @ApiPropertyOptional({
    description:
      'Optional project scope; caller must lead it and match its group.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  @ValidateIf((_o, value) => value != null)
  @IsUUID()
  projectId?: string | null;

  @ApiProperty({
    description: 'Opportunity title; may be empty while drafting.',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'The kind of research opportunity.',
    enum: OpportunityKind,
  })
  @IsEnum(OpportunityKind)
  opportunityKind: OpportunityKind;

  @ApiPropertyOptional({
    enum: TargetAudience,
    description:
      'Intended research audience; this field grants no permissions.',
    default: TargetAudience.ANY_RESEARCHER,
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsEnum(TargetAudience)
  targetAudience?: TargetAudience;

  @ApiPropertyOptional({
    description:
      'Expected contribution or role; cannot be blank when provided.',
    type: String,
    nullable: true,
    maxLength: 255,
  })
  @ValidateIf((_o, value) => value != null)
  @IsString()
  @Matches(/\S/, { message: 'expectedRole must not be blank' })
  @MaxLength(255)
  expectedRole?: string | null;

  @ApiPropertyOptional({
    description: 'Expertise tags sought from applicants.',
    type: [String],
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  requiredExpertiseTags?: string[];

  @ApiPropertyOptional({
    description: 'Opportunity details; required before publication.',
    type: String,
    nullable: true,
  })
  @ValidateIf((_o, value) => value != null)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    description:
      'Response SLA in calendar days, including weekends and holidays.',
    default: 5,
    minimum: 1,
    maximum: 2147483647,
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  responseSlaDays?: number;

  @ApiPropertyOptional({
    description:
      'Exact application cutoff timestamp; required before publication.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  @ValidateIf((_o, value) => value != null)
  @IsISO8601({ strict: true })
  applicationDeadline?: string | null;

  @ApiPropertyOptional({
    enum: [OpportunityStatus.DRAFT],
    default: OpportunityStatus.DRAFT,
    description:
      'New opportunities always start as DRAFT; publishing uses a status action',
  })
  @ValidateIf((_o, value) => value !== undefined)
  @Equals(OpportunityStatus.DRAFT)
  status?: OpportunityStatus;

  @ApiPropertyOptional({
    description: 'Archive timestamp; null leaves the opportunity unarchived.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  @ValidateIf((_o, value) => value != null)
  @IsISO8601({ strict: true })
  archivedAt?: string | null;
}
