import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

/**
 * Payload for updating user details or modifying active status (soft-deactivate).
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({
    description:
      'Whether the account is active. Setting to false deactivates the user and invalidates active sessions.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
