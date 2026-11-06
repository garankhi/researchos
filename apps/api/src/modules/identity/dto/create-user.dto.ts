import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum UserTypeEnum {
  FACULTY = 'FACULTY',
  STUDENT = 'STUDENT',
  STAFF = 'STAFF',
}

/**
 * Payload for creating a new user account by an administrator.
 */
export class CreateUserDto {
  @ApiProperty({
    description: 'The normalized email address of the account.',
    example: 'researcher@fpt.edu.vn',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    description: 'The full display name of the user.',
    example: 'Nguyễn Văn A',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullName: string;

  @ApiProperty({
    description: 'The classification category of the user account.',
    enum: UserTypeEnum,
    example: UserTypeEnum.FACULTY,
  })
  @IsEnum(UserTypeEnum)
  userType: UserTypeEnum;

  @ApiProperty({
    description: 'The academic department or administrative unit.',
    example: 'Software Engineering',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  departmentUnit: string;

  @ApiPropertyOptional({
    description: 'Unique institutional identifier synchronized from FPTU HR.',
    example: 'FPTU00123',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fptuGuid?: string;

  @ApiPropertyOptional({
    description: 'Academic title when applicable (e.g., GS, PGS).',
    example: 'PGS',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  academicTitle?: string;

  @ApiPropertyOptional({
    description: 'Academic degree when applicable (e.g., TS, ThS).',
    example: 'TS',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  academicDegree?: string;
}
