import { ApiProperty } from '@nestjs/swagger';

/**
 * Topic link associated with a research output revision.
 */
export class OutputTopicResponseDto {
  @ApiProperty({
    description: 'Identifier of the linked research topic.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  topicId: string;

  @ApiProperty({
    description: 'Name of the research topic.',
    example: 'Machine Learning',
  })
  topicName: string;

  @ApiProperty({
    description: 'Identifier of the parent subfield.',
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  subfieldId: string;

  @ApiProperty({
    description: 'Name of the parent subfield.',
    example: 'Artificial Intelligence',
  })
  subfieldName: string;

  @ApiProperty({
    description: 'Identifier of the top-level field.',
    format: 'uuid',
    example: '33333333-3333-4333-8333-333333333333',
  })
  fieldId: string;

  @ApiProperty({
    description: 'Name of the top-level field.',
    example: 'Computer Science',
  })
  fieldName: string;
}
