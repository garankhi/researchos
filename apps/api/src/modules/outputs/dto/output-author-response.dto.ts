import { ApiProperty } from '@nestjs/swagger';

/**
 * Author record associated with a research output.
 */
export class OutputAuthorResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the author record.',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    description: 'Research output identifier.',
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
  })
  outputId: string;

  @ApiProperty({
    description:
      'User ID of the internal researcher if linked to an account; null otherwise.',
    format: 'uuid',
    nullable: true,
    example: '33333333-3333-4333-8333-333333333333',
  })
  userId: string | null;

  @ApiProperty({
    description: 'Display name string of the author.',
    example: 'Nguyen Van A',
  })
  authorNameString: string;

  @ApiProperty({
    description: '1-based authorship order.',
    example: 1,
  })
  authorOrder: number;

  @ApiProperty({
    description: 'Whether this author is a corresponding author.',
    example: true,
  })
  isCorrespondingAuthor: boolean;
}
