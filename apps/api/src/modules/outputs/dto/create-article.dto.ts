import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutputType } from '@researchos/database';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  Equals,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { submittedValue, trimText } from './submitted-value.js';

class CreateArticleAuthorDto {
  @ApiProperty({
    type: String,
    description: 'Name as it appears in the confirmed byline.',
    maxLength: 255,
    example: 'Nguyen Minh',
  })
  @Transform(trimText)
  @IsString({ message: 'author_name_invalid' })
  @IsNotEmpty({ message: 'author_name_invalid' })
  @MaxLength(255, { message: 'author_name_invalid' })
  displayName!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'ResearchOS account explicitly selected for this author.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'id_uuid' })
  userId?: string | null;
}

export class CreateArticleDto {
  @ApiPropertyOptional({
    enum: [OutputType.ARTICLE],
    default: OutputType.ARTICLE,
    description: 'Output type for the Article creation flow.',
  })
  @Transform(trimText)
  @ValidateIf((_object, value) => value !== undefined)
  @Equals(OutputType.ARTICLE, { message: 'article_type_invalid' })
  outputType?: typeof OutputType.ARTICLE;

  @ApiProperty({ type: String, maxLength: 500, description: 'Article title.' })
  @Transform(trimText)
  @IsString({ message: 'title_invalid' })
  @IsNotEmpty({ message: 'title_required' })
  @MaxLength(500, { message: 'revision_title_too_long' })
  title!: string;

  @ApiProperty({
    type: [CreateArticleAuthorDto],
    minItems: 1,
    description: 'The confirmed byline in publication order.',
  })
  @IsArray({ message: 'article_authors_invalid' })
  @ArrayNotEmpty({ message: 'article_authors_invalid' })
  @IsObject({ each: true, message: 'article_authors_invalid' })
  @ValidateNested({ each: true, message: 'article_authors_invalid' })
  @Type(() => CreateArticleAuthorDto)
  authors!: CreateArticleAuthorDto[];

  @ApiProperty({
    type: String,
    maxLength: 10,
    example: '18-11-2026',
    description:
      'Publication date as YYYY, YYYY-MM, YYYY-MM-DD or DD-MM-YYYY. Partial dates retain their precision.',
  })
  @Transform(trimText)
  @IsString({ message: 'publication_date_invalid' })
  @IsNotEmpty({ message: 'publication_date_required' })
  @MaxLength(10, { message: 'publication_date_invalid' })
  publicationDate!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://doi.org/10.1234/article',
    description:
      'A DOI, optionally prefixed by doi: or a doi.org resolver URL.',
  })
  @Transform(trimText)
  @IsOptional()
  @IsString({ message: 'doi_invalid' })
  doi?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: 'Article abstract.',
    maxLength: 20_000,
    nullable: true,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString({ message: 'abstract_invalid' })
  @MaxLength(20_000, { message: 'abstract_too_long' })
  abstract?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: 'Journal name, returned as venue on the revision.',
    maxLength: 255,
    nullable: true,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString({ message: 'venue_invalid' })
  @MaxLength(255, { message: 'venue_too_long' })
  journal?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: 'Journal volume.',
    maxLength: 50,
    nullable: true,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString({ message: 'article_volume_invalid' })
  @MaxLength(50, { message: 'article_volume_invalid' })
  volume?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: 'Journal issue.',
    maxLength: 50,
    nullable: true,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString({ message: 'article_issue_invalid' })
  @MaxLength(50, { message: 'article_issue_invalid' })
  issue?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: 'Page range or article number.',
    maxLength: 100,
    nullable: true,
  })
  @Transform(trimText)
  @IsOptional()
  @IsString({ message: 'article_pages_invalid' })
  @MaxLength(100, { message: 'article_pages_invalid' })
  pages?: string | null;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Whether the Article was peer-reviewed. Null means unspecified.',
    nullable: true,
  })
  @Transform(submittedValue)
  @IsOptional()
  @IsBoolean({ message: 'peer_reviewed_invalid' })
  peerReviewed?: boolean | null;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    description: 'Active ResearchOS Topic IDs confirmed by the submitter.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray({ message: 'article_topics_invalid' })
  @IsUUID(undefined, { each: true, message: 'id_uuid' })
  topicIds?: string[];
}

export class CreateArticleResponseDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Created Article ID.',
  })
  outputId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'First released revision ID.',
  })
  revisionId!: string;
}
