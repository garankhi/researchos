import { ApiProperty } from '@nestjs/swagger';

/**
 * The quick information the hover card shows about a researcher.
 *
 * This is deliberately smaller than `ProfileResponseDto`: the card shows
 * who the researcher is and what they work on, and nothing else. The full
 * record is served by the profile detail endpoint.
 */
export class ProfilePreviewResponseDto {
  @ApiProperty({
    description: 'Full display name of the researcher.',
    example: 'PGS. TS. Nguyễn Văn A',
  })
  fullName: string;

  @ApiProperty({
    description: 'Department or administrative unit.',
    example: 'Software Engineering',
  })
  departmentUnit: string;

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
    description: 'Biographical summary and research statement.',
    example: 'Associate professor specializing in distributed systems and AI.',
    type: 'string',
    nullable: true,
  })
  bio: string | null;

  @ApiProperty({
    description: 'Storage key referencing the profile avatar image.',
    example: 'avatars/1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11.png',
    type: 'string',
    nullable: true,
  })
  avatarStorageKey: string | null;
}
