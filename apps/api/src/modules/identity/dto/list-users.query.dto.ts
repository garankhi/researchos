import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { UserTypeEnum } from './create-user.dto.js';

/**
 * Query filters for searching and paginating user accounts.
 */
export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search string matching user full name or email address.',
    example: 'Nguyễn Văn',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter accounts by user type.',
    enum: UserTypeEnum,
  })
  @IsOptional()
  @IsEnum(UserTypeEnum)
  userType?: UserTypeEnum;

  @ApiPropertyOptional({
    description: 'Filter accounts by department or administrative unit.',
    example: 'Software Engineering',
  })
  @IsOptional()
  @IsString()
  departmentUnit?: string;

  @ApiPropertyOptional({
    description: 'Filter accounts by active status.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1')
      return true;
    if (value === 'false' || value === false || value === 0 || value === '0')
      return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
