import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AccessRoleEnum {
  RESEARCHER = 'RESEARCHER',
  ADMIN = 'ADMIN',
}

/**
 * Payload for granting an access role to a user.
 */
export class GrantRoleDto {
  @ApiProperty({
    description: 'The access role to grant (RESEARCHER or ADMIN).',
    enum: AccessRoleEnum,
    example: AccessRoleEnum.ADMIN,
  })
  @IsEnum(AccessRoleEnum)
  role: AccessRoleEnum;

  @ApiPropertyOptional({
    description: 'Administrative justification for granting the role.',
    example: 'Assigned as laboratory administrator.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
