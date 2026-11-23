import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  NotContains,
} from 'class-validator';
import { trimText } from '../../../common/dto/submitted-value.js';

const suggestionStatuses = ['pending', 'ready', 'unavailable'] as const;

export class RequestTopicSuggestionsDto {
  @ApiProperty({ description: 'Current Article title.', maxLength: 500 })
  @Transform(trimText)
  @IsString({ message: 'title_invalid' })
  @IsNotEmpty({ message: 'title_required' })
  @NotContains('\0', { message: 'title_invalid' })
  @MaxLength(500, { message: 'revision_title_too_long' })
  title!: string;

  @ApiPropertyOptional({
    description: 'Current Article abstract, if available.',
    type: String,
    nullable: true,
    maxLength: 20_000,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString({ message: 'abstract_invalid' })
  @NotContains('\0', { message: 'abstract_invalid' })
  @MaxLength(20_000, { message: 'abstract_too_long' })
  abstract?: string | null;
}

export class TopicSuggestionRequestDto {
  @ApiProperty({
    description: 'ID to poll for the suggestion result.',
    format: 'uuid',
  })
  requestId!: string;
}

export class SuggestedTopicDto {
  @ApiProperty({
    description: 'Selectable ResearchOS Topic ID.',
    format: 'uuid',
  })
  topicId!: string;

  @ApiProperty({ description: 'Current display name of the Topic.' })
  name!: string;

  @ApiProperty({
    description: 'Current description of the Topic.',
    type: String,
    nullable: true,
  })
  description!: string | null;
}

export class TopicSuggestionStatusDto {
  @ApiProperty({
    description:
      'Pending while processing, ready on success, or unavailable when manual selection can be used.',
    enum: suggestionStatuses,
  })
  status!: (typeof suggestionStatuses)[number];

  @ApiProperty({
    description: 'Up to five active Topics in order of relevance.',
    type: [SuggestedTopicDto],
    maxItems: 5,
  })
  suggestions!: SuggestedTopicDto[];
}
