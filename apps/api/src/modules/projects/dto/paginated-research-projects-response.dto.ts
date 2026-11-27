import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';
import { ResearchProjectResponseDto } from './research-project-response.dto.js';

/**
 * Paginated response of research projects.
 */
export class PaginatedResearchProjectsResponseDto extends PaginatedResultDto<ResearchProjectResponseDto> {
  @ApiProperty({
    description: 'List of research projects on this page.',
    type: [ResearchProjectResponseDto],
  })
  declare items: ResearchProjectResponseDto[];
}
