import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';
import { UserResponseDto } from './user-response.dto.js';

/**
 * Paginated list of user accounts for administrator management.
 */
export class PaginatedUsersResponseDto extends PaginatedResultDto<UserResponseDto> {
  @ApiProperty({
    description: 'The user accounts belonging to this page.',
    type: [UserResponseDto],
  })
  declare items: UserResponseDto[];
}
