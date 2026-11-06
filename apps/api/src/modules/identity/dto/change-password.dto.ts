import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current LOCAL password used to reauthenticate the caller.',
    maxLength: 1024,
  })
  @IsString({ message: 'password_invalid' })
  @MinLength(1, { message: 'password_required' })
  @MaxLength(1024, { message: 'password_too_long' })
  currentPassword!: string;

  @ApiProperty({
    description:
      'Replacement password, different from the current password. No trimming is applied.',
    minLength: 12,
    maxLength: 1024,
  })
  @IsString({ message: 'password_invalid' })
  @MinLength(12, { message: 'new_password_too_short' })
  @MaxLength(1024, { message: 'password_too_long' })
  newPassword!: string;
}

export class ChangePasswordResultDto {
  @ApiProperty({
    description:
      'The password changed; all existing sessions were revoked. Sign in again.',
  })
  changed!: boolean;
}
