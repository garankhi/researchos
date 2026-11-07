import { ApiProperty } from '@nestjs/swagger';
import {
  OpportunityKind,
  OpportunityStatus,
  TargetAudience,
} from '@researchos/database';

export class OpportunityResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  groupId: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  projectId: string | null;
  @ApiProperty({ format: 'uuid' })
  creatorId: string;
  @ApiProperty()
  title: string;
  @ApiProperty({ enum: OpportunityKind })
  opportunityKind: OpportunityKind;
  @ApiProperty({ enum: TargetAudience })
  targetAudience: TargetAudience;
  @ApiProperty({ type: String, nullable: true })
  expectedRole: string | null;
  @ApiProperty({ type: [String] })
  requiredExpertiseTags: string[];
  @ApiProperty({ type: String, nullable: true })
  description: string | null;
  @ApiProperty()
  responseSlaDays: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  applicationDeadline: string | null;
  @ApiProperty({ enum: OpportunityStatus })
  status: OpportunityStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  archivedAt: string | null;
}

export class OpportunityPageDto {
  @ApiProperty({ type: [OpportunityResponseDto] })
  items: OpportunityResponseDto[];
  @ApiProperty()
  page: number;
  @ApiProperty()
  pageSize: number;
  @ApiProperty()
  total: number;
}
