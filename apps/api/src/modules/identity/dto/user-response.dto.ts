import { ApiProperty } from '@nestjs/swagger';

/**
 * Representation of a user account for administrator management.
 */
export class UserResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the user account (UUID).',
    example: '1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11',
  })
  id: string;

  @ApiProperty({
    description: 'Normalized email address of the account.',
    example: 'faculty@researchos.local',
  })
  email: string;

  @ApiProperty({
    description: 'Full display name of the user.',
    example: 'Nguyễn Văn A',
  })
  fullName: string;

  @ApiProperty({
    description: 'Category classification of the user.',
    enum: ['FACULTY', 'STUDENT', 'STAFF'],
    example: 'FACULTY',
  })
  userType: string;

  @ApiProperty({
    description: 'Department or administrative unit.',
    example: 'Software Engineering',
  })
  departmentUnit: string;

  @ApiProperty({
    description: 'Unique institutional identifier synchronized from FPTU HR.',
    example: 'FPTU00123',
    type: 'string',
    nullable: true,
  })
  fptuGuid: string | null;

  @ApiProperty({
    description: 'Academic title when applicable.',
    example: 'PGS',
    type: 'string',
    nullable: true,
  })
  academicTitle: string | null;

  @ApiProperty({
    description: 'Academic degree when applicable.',
    example: 'TS',
    type: 'string',
    nullable: true,
  })
  academicDegree: string | null;

  @ApiProperty({
    description: 'Whether the account is active.',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Timestamp of the user’s last successful sign-in.',
    example: '2026-11-06T10:00:00.000Z',
    type: 'string',
    nullable: true,
  })
  lastLoginAt: string | null;

  @ApiProperty({
    description: 'The effective roles currently held by the user.',
    type: 'array',
    items: { type: 'string', enum: ['RESEARCHER', 'ADMIN'] },
    example: ['RESEARCHER'],
  })
  roles: string[];
}
