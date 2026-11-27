import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus, ProjectType } from '@researchos/database';

/**
 * A research project the caller may post into.
 *
 * The project is the container of a work with a PROJECT scope: the
 * project lead and the leads of the parent group decide who may read
 * the work, while the poster keeps the right to edit the content.
 */
export class ResearchProjectResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the research project.',
    format: 'uuid',
    example: '66666666-6666-4666-8666-666666666666',
  })
  id: string;

  @ApiProperty({
    description: 'Project code, when the project has one.',
    type: String,
    nullable: true,
    example: 'AI-2026-01',
  })
  code: string | null;

  @ApiProperty({
    description: 'Project title.',
    example: 'Federated learning for clinical imaging',
  })
  title: string;

  @ApiProperty({
    description: 'Kind of project.',
    enum: ProjectType,
    example: ProjectType.COLLABORATIVE_RESEARCH,
  })
  projectType: ProjectType;

  @ApiProperty({
    description:
      'The group the project belongs to. Null for a standalone project.',
    format: 'uuid',
    nullable: true,
    example: '55555555-5555-4555-8555-555555555555',
  })
  groupId: string | null;

  @ApiProperty({
    description: 'The user who leads the project.',
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  leadId: string;

  @ApiProperty({
    description: 'Lifecycle status of the project.',
    enum: ProjectStatus,
    example: ProjectStatus.IN_PROGRESS,
  })
  status: ProjectStatus;

  @ApiPropertyOptional({
    description:
      'Whether the caller leads the project. A project lead manages the ' +
      'audience of the works posted into the project.',
    type: Boolean,
  })
  isCallerLead?: boolean;
}
