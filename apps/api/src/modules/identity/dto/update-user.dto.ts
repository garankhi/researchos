import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CreateUserDto, UserTypeEnum } from './create-user.dto.js';

/**
 * Payload for updating user details or modifying active status (soft-deactivate).
 *
 * Non-nullable columns (`email`, `fullName`, `userType`, `departmentUnit`, `isActive`)
 * use `@ValidateIf((_, value) => value !== undefined)` so that omitted fields
 * (`undefined`) are skipped while explicit `null` payloads are rejected with 400.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ValidateIf((_, value) => value !== undefined)
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(UserTypeEnum)
  userType?: UserTypeEnum;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  departmentUnit?: string;

  @ApiPropertyOptional({
    description:
      'Whether the account is active. Setting to false deactivates the user and invalidates active sessions.',
    example: true,
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ obj, key }) =>
    obj && typeof obj === 'object'
      ? (obj as Record<string, unknown>)[key]
      : undefined,
  )
  @IsBoolean()
  isActive?: boolean;
}
