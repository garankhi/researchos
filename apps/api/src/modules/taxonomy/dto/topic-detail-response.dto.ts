import { ApiProperty } from '@nestjs/swagger';
import { FieldResponseDto } from './field-response.dto.js';
import { SubfieldResponseDto } from './subfield-response.dto.js';
import { TopicResponseDto } from './topic-response.dto.js';

/**
 * Detailed research topic representation including full parent hierarchy context.
 */
export class TopicDetailResponseDto extends TopicResponseDto {
  @ApiProperty({
    description: 'The parent research subfield of this topic.',
    type: SubfieldResponseDto,
  })
  subfield: SubfieldResponseDto;

  @ApiProperty({
    description: 'The root research field of this topic.',
    type: FieldResponseDto,
  })
  field: FieldResponseDto;
}
