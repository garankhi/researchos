import { ApiProperty } from '@nestjs/swagger';
import { OpportunityApplicationStatus } from '@researchos/database';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';

export class CreateApplicationDto {
  @ApiProperty({
    description: 'Researcher application note explaining their interest.',
    maxLength: 10000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  applicantNote: string;
}

export class ApplicationResponseDto {
  @ApiProperty({ description: 'Application identifier.', format: 'uuid' })
  id: string;

  @ApiProperty({
    description: 'Opportunity receiving the application.',
    format: 'uuid',
  })
  opportunityId: string;

  @ApiProperty({
    description: 'Researcher submitting the application.',
    format: 'uuid',
  })
  applicantId: string;

  @ApiProperty({ description: 'Researcher application note.' })
  applicantNote: string;

  @ApiProperty({
    description: 'Current application state.',
    enum: OpportunityApplicationStatus,
  })
  status: OpportunityApplicationStatus;

  @ApiProperty({
    description: 'Opportunity owner response note.',
    type: String,
    nullable: true,
  })
  responseNote: string | null;

  @ApiProperty({
    description: 'Researcher who responded, if any.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  respondedBy: string | null;

  @ApiProperty({
    description: 'Submission timestamp set by PostgreSQL.',
    format: 'date-time',
  })
  appliedAt: string;

  @ApiProperty({
    description: 'Response deadline snapshotted from the SLA at submission.',
    format: 'date-time',
  })
  responseDueAt: string;

  @ApiProperty({
    description: 'Response timestamp, if any.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  respondedAt: string | null;

  @ApiProperty({
    description: 'Withdrawal timestamp, if any.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  withdrawnAt: string | null;

  @ApiProperty({
    description: 'Database time used for this server-calculated countdown.',
    format: 'date-time',
  })
  countdownAsOf: string;

  @ApiProperty({
    description:
      'Nonnegative seconds remaining while pending; null after response or withdrawal.',
    type: Number,
    nullable: true,
  })
  remainingSeconds: number | null;

  @ApiProperty({
    description:
      'Whether this pending application has reached its response deadline.',
  })
  isOverdue: boolean;
}

export class ApplicationPageDto extends PaginatedResultDto<ApplicationResponseDto> {
  @ApiProperty({
    description: 'Applications in this page.',
    type: [ApplicationResponseDto],
  })
  declare items: ApplicationResponseDto[];
}
