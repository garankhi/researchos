import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';

export class CreateGroupDirectionDto {
  @ApiProperty({
    description: 'Published research direction title.',
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    description: 'Research direction details; null clears the description.',
    type: String,
    nullable: true,
    maxLength: 10000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Optional active taxonomy topic; null clears the topic link.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  topicId?: string | null;
}

export class UpdateGroupDirectionDto extends PartialType(
  CreateGroupDirectionDto,
  { skipNullProperties: false },
) {}

export class DirectionTaxonomyNodeDto {
  @ApiProperty({ description: 'Taxonomy node identifier.', format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Taxonomy node display name.' })
  name: string;
}

export class DirectionTopicPathDto {
  @ApiProperty({
    description: 'Root research field.',
    type: DirectionTaxonomyNodeDto,
  })
  field: DirectionTaxonomyNodeDto;

  @ApiProperty({
    description: 'Parent research subfield.',
    type: DirectionTaxonomyNodeDto,
  })
  subfield: DirectionTaxonomyNodeDto;

  @ApiProperty({
    description: 'Linked research topic.',
    type: DirectionTaxonomyNodeDto,
  })
  topic: DirectionTaxonomyNodeDto;
}

export class GroupDirectionResponseDto {
  @ApiProperty({
    description: 'Research direction identifier.',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'Group publishing the direction.',
    format: 'uuid',
  })
  groupId: string;

  @ApiProperty({
    description: 'Linked taxonomy topic, if selected.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  topicId: string | null;

  @ApiProperty({ description: 'Published direction title.' })
  title: string;

  @ApiProperty({
    description: 'Published direction details.',
    type: String,
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'Creation/publication timestamp.',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Full taxonomy context, or null for an unlinked direction.',
    type: DirectionTopicPathDto,
    nullable: true,
  })
  topicPath: DirectionTopicPathDto | null;
}

export class GroupDirectionPageDto extends PaginatedResultDto<GroupDirectionResponseDto> {
  @ApiProperty({
    description: 'Published directions in this page.',
    type: [GroupDirectionResponseDto],
  })
  declare items: GroupDirectionResponseDto[];
}
