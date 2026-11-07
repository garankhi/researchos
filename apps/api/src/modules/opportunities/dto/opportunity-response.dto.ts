import { ApiProperty } from '@nestjs/swagger';
import {
  OpportunityKind,
  OpportunityStatus,
  TargetAudience,
} from '@researchos/database';

export class OpportunityResponseDto {
  @ApiProperty({ description: 'Opportunity identifier.', format: 'uuid' })
  id: string;
  @ApiProperty({
    description:
      'Associated group, or null for an opportunity without group scope.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  groupId: string | null;
  @ApiProperty({
    description: 'Associated project, if any.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  projectId: string | null;
  @ApiProperty({
    description: 'Authenticated researcher who created the opportunity.',
    format: 'uuid',
  })
  creatorId: string;
  @ApiProperty({ description: 'Opportunity title.' })
  title: string;
  @ApiProperty({
    description: 'Kind of research opportunity.',
    enum: OpportunityKind,
  })
  opportunityKind: OpportunityKind;
  @ApiProperty({
    description: 'Intended audience; grants no access by itself.',
    enum: TargetAudience,
  })
  targetAudience: TargetAudience;
  @ApiProperty({
    description: 'Expected contribution or role.',
    type: String,
    nullable: true,
  })
  expectedRole: string | null;
  @ApiProperty({
    description: 'Expertise tags sought from applicants.',
    type: [String],
  })
  requiredExpertiseTags: string[];
  @ApiProperty({
    description: 'Detailed opportunity description.',
    type: String,
    nullable: true,
  })
  description: string | null;
  @ApiProperty({ description: 'Response SLA measured in calendar days.' })
  responseSlaDays: number;
  @ApiProperty({
    description: 'Exact application cutoff timestamp.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  applicationDeadline: string | null;
  @ApiProperty({
    description: 'Current lifecycle status.',
    enum: OpportunityStatus,
  })
  status: OpportunityStatus;
  @ApiProperty({
    description: 'Server-assigned publication timestamp.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  publishedAt: string | null;
  @ApiProperty({
    description: 'Archive timestamp, if archived.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  archivedAt: string | null;
}

export class OpportunityPageDto {
  @ApiProperty({
    description: 'Visible opportunities on this page.',
    type: [OpportunityResponseDto],
  })
  items: OpportunityResponseDto[];
  @ApiProperty({ description: 'Current one-based page number.' })
  page: number;
  @ApiProperty({ description: 'Maximum number of items per page.' })
  pageSize: number;
  @ApiProperty({
    description:
      'Total opportunities matching the filters and caller visibility.',
  })
  total: number;
}
