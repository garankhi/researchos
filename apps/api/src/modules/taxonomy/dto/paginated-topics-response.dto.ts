import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';
import { TopicResponseDto } from './topic-response.dto.js';

/**
 * Paginated list of research topics.
 */
export class PaginatedTopicsResponseDto extends PaginatedResultDto<TopicResponseDto> {
  @ApiProperty({
    description: 'The research topics of this page.',
    type: [TopicResponseDto],
  })
  declare items: TopicResponseDto[];
}
