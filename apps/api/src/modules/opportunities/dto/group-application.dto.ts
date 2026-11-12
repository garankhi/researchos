import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';
import { ApplicationResponseDto } from './application.dto.js';

/**
 * An application on one of a group's opportunities.
 *
 * It carries the application fields plus the identity of the opportunity it
 * targets, so a group's Applications tab can label each row without a second
 * request per row.
 */
export class GroupApplicationResponseDto extends ApplicationResponseDto {
  @ApiProperty({
    description: 'Title of the opportunity the application targets.',
  })
  opportunityTitle: string;
}

/**
 * Paginated applications across every opportunity of one group.
 */
export class GroupApplicationPageDto extends PaginatedResultDto<GroupApplicationResponseDto> {
  @ApiProperty({
    description: 'Applications in this page.',
    type: [GroupApplicationResponseDto],
  })
  declare items: GroupApplicationResponseDto[];
}
