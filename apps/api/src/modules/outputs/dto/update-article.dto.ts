import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsObject,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CreateArticleAuthorDto,
  CreateArticleDto,
} from './create-article.dto.js';

class UpdateArticleAuthorDto extends CreateArticleAuthorDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'ID of an author already on the current release.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID(undefined, { message: 'id_uuid' })
  authorId?: string;
}

export class UpdateArticleDto extends PartialType(
  PickType(CreateArticleDto, [
    'title',
    'publicationDate',
    'doi',
    'abstract',
    'journal',
    'volume',
    'issue',
    'pages',
    'peerReviewed',
    'topicIds',
  ]),
  { skipNullProperties: false },
) {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Current release ID observed by the editor.',
  })
  @IsUUID(undefined, { message: 'id_uuid' })
  expectedRevisionId!: string;

  @ApiPropertyOptional({
    type: [UpdateArticleAuthorDto],
    minItems: 1,
    description:
      'The complete byline in publication order. Omit to keep the current byline.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray({ message: 'article_authors_invalid' })
  @ArrayNotEmpty({ message: 'article_authors_invalid' })
  @IsObject({ each: true, message: 'article_authors_invalid' })
  @ValidateNested({ each: true, message: 'article_authors_invalid' })
  @Type(() => UpdateArticleAuthorDto)
  authors?: UpdateArticleAuthorDto[];
}
