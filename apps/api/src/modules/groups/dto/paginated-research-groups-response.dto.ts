import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';
import { ResearchGroupResponseDto } from './research-group-response.dto.js';

/**
 * Paginated list of research groups.
 */
export class PaginatedResearchGroupsResponseDto extends PaginatedResultDto<ResearchGroupResponseDto> {
  @ApiProperty({
    description: 'The research groups belonging to this page.',
    type: [ResearchGroupResponseDto],
  })
  declare items: ResearchGroupResponseDto[];
}
