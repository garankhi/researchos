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

/**
 * One application, with the display data the screens render.
 *
 * The application row itself carries only the relation (`applicant_id`,
 * `applicant_note`, the status and the timestamps); the applicant's name,
 * email, department and avatar come from the joined `users` row and its
 * optional `researcher_profiles` row, so an opportunity's application list
 * renders a roster without an N+1 walk over the profile endpoints.
 *
 * The profile fields are nullable on purpose: the applicant's account row
 * always exists (the foreign key guarantees it), but the profile row does
 * not, so the avatar may be absent.
 */
export class ApplicationResponseDto {
  @ApiProperty({ description: 'Application identifier.', format: 'uuid' })
  id: string;

  @ApiProperty({
    description: 'Opportunity receiving the application.',
    format: 'uuid',
  })
  opportunityId: string;

  @ApiProperty({
    description:
      'Title of the opportunity the application targets, if available.',
    type: String,
    nullable: true,
    required: false,
  })
  opportunityTitle?: string | null;

  @ApiProperty({
    description: 'Researcher submitting the application.',
    format: 'uuid',
  })
  applicantId: string;

  @ApiProperty({
    description: 'Full display name of the applicant.',
    example: 'PGS. TS. Nguyễn Văn A',
  })
  applicantFullName: string;

  @ApiProperty({
    description: 'Institutional email address of the applicant.',
    example: 'nguyenvana@fpt.edu.vn',
  })
  applicantEmail: string;

  @ApiProperty({
    description: 'Department or administrative unit of the applicant.',
    example: 'Software Engineering',
  })
  applicantDepartmentUnit: string;

  @ApiProperty({
    description: 'Storage key referencing the applicant avatar image.',
    example: 'avatars/1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11.png',
    type: 'string',
    nullable: true,
  })
  applicantAvatarStorageKey: string | null;

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
