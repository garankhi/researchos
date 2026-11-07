import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload for revoking an active access role from a user.
 */
export class RevokeRoleDto {
  @ApiPropertyOptional({
    description: 'Administrative reason for revoking the role.',
    example: 'Term finished or role reassigned.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
