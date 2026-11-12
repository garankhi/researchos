import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/**
 * Query parameters for listing visible research outputs.
 */
export class ListOutputsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter outputs owned by a specific researcher user (UUID).',
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Filter outputs linked to a specific research group (UUID).',
    example: '22222222-2222-4222-8222-222222222222',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description:
      'Filter outputs a specific researcher is an author of (UUID), including co-authored works they do not own.',
    example: '33333333-3333-4333-8333-333333333333',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  authorId?: string;
}
