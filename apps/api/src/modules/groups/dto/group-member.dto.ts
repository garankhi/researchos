import { ApiProperty } from '@nestjs/swagger';
import { GroupMemberRole } from '@researchos/database';
import { IsEnum, IsUUID } from 'class-validator';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';

export class UpdateGroupMemberDto {
  @ApiProperty({
    description: 'Role of the member within the group.',
    enum: GroupMemberRole,
  })
  @IsEnum(GroupMemberRole)
  role: GroupMemberRole;
}

export class AddGroupMemberDto extends UpdateGroupMemberDto {
  @ApiProperty({
    description: 'Existing user to add to the group.',
    format: 'uuid',
  })
  @IsUUID()
  userId: string;
}

export class GroupMemberResponseDto {
  @ApiProperty({
    description: 'Group this membership belongs to.',
    format: 'uuid',
  })
  groupId: string;

  @ApiProperty({
    description: 'User this membership belongs to.',
    format: 'uuid',
  })
  userId: string;

  @ApiProperty({
    description: 'Role of the member within the group.',
    enum: GroupMemberRole,
  })
  role: GroupMemberRole;

  @ApiProperty({
    description: 'Timestamp when the user joined the group.',
    format: 'date-time',
  })
  joinedAt: string;
}

export class GroupMemberPageDto extends PaginatedResultDto<GroupMemberResponseDto> {
  @ApiProperty({
    description: 'Members belonging to this page.',
    type: [GroupMemberResponseDto],
  })
  declare items: GroupMemberResponseDto[];
}
