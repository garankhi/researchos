import { ApiProperty } from '@nestjs/swagger';

/**
 * Representation of a research group.
 */
export class ResearchGroupResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the research group (UUID).',
    example: '7b0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e99',
  })
  id: string;

  @ApiProperty({
    description: 'Unique short code of the research group.',
    example: 'AI-LAB',
  })
  code: string;

  @ApiProperty({
    description: 'Display name of the research group.',
    example: 'Artificial Intelligence & Machine Learning Lab',
  })
  name: string;

  @ApiProperty({
    description: 'Unique identifier of the group leader (UUID).',
    example: '1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11',
  })
  leadId: string;

  @ApiProperty({
    description: 'Detailed description or research scope of the group.',
    example:
      'Focuses on applied deep learning, natural language processing, and intelligent educational tools.',
    type: String,
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Whether the research group is currently active.',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description:
      'Timestamp when the group was archived, or null if currently active.',
    example: null,
    type: String,
    nullable: true,
  })
  archivedAt: string | null;

  @ApiProperty({
    description: 'Timestamp when the group was created.',
    example: '2026-11-07T08:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Timestamp when the group was last updated.',
    example: '2026-11-07T08:00:00.000Z',
  })
  updatedAt: string;
}
