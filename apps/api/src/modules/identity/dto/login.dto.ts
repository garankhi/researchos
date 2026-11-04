import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The credentials a local login sends.
 *
 * The email is normalized (`lower` + `trim`) before the lookup, exactly
 * the way the database trigger `normalize_user_email` normalizes it on
 * write — so a user who types `Faculty@ResearchOS.local` finds the same
 * account as one who types the address in lower case.
 */
export class LoginDto {
  @ApiProperty({
    description:
      "The account's email address. It is normalized before the lookup, " +
      'so the case and the surrounding spaces do not matter.',
    example: 'faculty@researchos.local',
  })
  @IsEmail({}, { message: 'email_invalid' })
  @IsString()
  @MaxLength(255, { message: 'email_too_long' })
  email: string;

  @ApiProperty({
    description: "The account's password.",
    example: 'ResearchOS!Dev2026',
  })
  @IsString()
  @MinLength(1, { message: 'password_required' })
  @MaxLength(1024, { message: 'password_too_long' })
  password: string;
}
