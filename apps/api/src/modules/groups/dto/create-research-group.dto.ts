import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Payload for creating a new research group.
 */
export class CreateResearchGroupDto {
  @ApiProperty({
    description: 'Unique short code identifying the research group.',
    example: 'AI-LAB',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({
    description: 'Display name of the research group.',
    example: 'Artificial Intelligence & Machine Learning Lab',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description:
      'Identifier of the researcher leading the group (UUID). Defaults to the authenticated creator when omitted.',
    example: '1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({
    description: 'Detailed description or research scope of the group.',
    example:
      'Focuses on applied deep learning, natural language processing, and intelligent educational tools.',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string | null;
}
