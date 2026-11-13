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

/**
 * One membership row, with the display data the group hub renders.
 *
 * The membership itself carries only the relation (`group_id`, `user_id`,
 * `role`, `joined_at`); the display fields come from the joined `users`
 * row and its optional `researcher_profiles` row, so the hub renders a
 * roster without an N+1 walk over the profile endpoints — and without
 * hitting the profile visibility rule, since an unconfirmed member is
 * still listed here.
 *
 * The display fields are nullable on purpose: a member's account row
 * always exists (the foreign key guarantees it), but the profile row does
 * not, so `avatarStorageKey` and `bio` may be absent.
 */
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

  @ApiProperty({
    description: 'Full display name of the member.',
    example: 'PGS. TS. Nguyễn Văn A',
  })
  fullName: string;

  @ApiProperty({
    description: 'Institutional email address of the member.',
    example: 'nguyenvana@fpt.edu.vn',
  })
  email: string;

  @ApiProperty({
    description: 'Department or administrative unit of the member.',
    example: 'Software Engineering',
  })
  departmentUnit: string;

  @ApiProperty({
    description: 'Academic title of the member, when the member has one.',
    example: 'PGS',
    type: 'string',
    nullable: true,
  })
  academicTitle: string | null;

  @ApiProperty({
    description: 'Academic degree of the member, when the member has one.',
    example: 'TS',
    type: 'string',
    nullable: true,
  })
  academicDegree: string | null;

  @ApiProperty({
    description: 'Category classification of the member.',
    example: 'FACULTY',
  })
  userType: string;

  @ApiProperty({
    description: 'Storage key referencing the member avatar image.',
    example: 'avatars/1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11.png',
    type: 'string',
    nullable: true,
  })
  avatarStorageKey: string | null;

  @ApiProperty({
    description:
      'Biographical summary of the member, when the member has a profile.',
    type: 'string',
    nullable: true,
  })
  bio: string | null;
}

export class GroupMemberPageDto extends PaginatedResultDto<GroupMemberResponseDto> {
  @ApiProperty({
    description: 'Members belonging to this page.',
    type: [GroupMemberResponseDto],
  })
  declare items: GroupMemberResponseDto[];
}
