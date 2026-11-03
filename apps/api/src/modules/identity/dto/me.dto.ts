import { ApiProperty } from '@nestjs/swagger';

/**
 * The payload of `GET /me` and of a successful login.
 *
 * It is the bare payload — the response envelope is applied by the global
 * interceptor, so this class never carries `success` or `data`.
 *
 * The roles are the **live** roles, read from the database on every call.
 * They are never a snapshot of what the session was created with, so a
 * revoked grant takes effect on the next request.
 */
export class MeDto {
  @ApiProperty({
    description: "The account's id.",
    example: '1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11',
  })
  id: string;

  @ApiProperty({
    description: "The account's email address, normalized.",
    example: 'faculty@researchos.local',
  })
  email: string;

  @ApiProperty({
    description: "The account's display name.",
    example: 'Dev Faculty',
  })
  fullName: string;

  @ApiProperty({
    description: 'The kind of account.',
    enum: ['FACULTY', 'STUDENT', 'STAFF'],
    example: 'FACULTY',
  })
  userType: string;

  @ApiProperty({
    description: 'The department or unit the account belongs to.',
    example: 'FPTU',
  })
  departmentUnit: string;

  @ApiProperty({
    description: "The account's academic title, when it has one.",
    example: 'PGS',
    type: 'string',
    nullable: true,
  })
  academicTitle: string | null;

  @ApiProperty({
    description: "The account's academic degree, when it has one.",
    example: 'TS',
    type: 'string',
    nullable: true,
  })
  academicDegree: string | null;

  @ApiProperty({
    description:
      'The roles the account currently holds. `RESEARCHER` and `ADMIN` are ' +
      'the two roles; a faculty account is a researcher through the ' +
      'baseline rule, without an explicit grant.',
    type: 'array',
    items: { type: 'string', enum: ['RESEARCHER', 'ADMIN'] },
    example: ['RESEARCHER'],
  })
  roles: string[];

  @ApiProperty({
    description:
      'Whether the account finished the onboarding. A missing profile row ' +
      'means false — it never creates one.',
    example: true,
  })
  onboardingCompleted: boolean;

  @ApiProperty({
    description:
      'Whether the account confirmed its profile. A missing profile row ' +
      'means false.',
    example: true,
  })
  profileConfirmed: boolean;

  @ApiProperty({
    description:
      'Whether the account must change its password before it can use the ' +
      'rest of the API.',
    example: false,
  })
  mustChangePassword: boolean;
}
