import { ApiProperty } from '@nestjs/swagger';

/**
 * Representation of a user role assignment record.
 */
export class RoleAssignmentResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the role assignment record (UUID).',
    example: 'd0000000-0000-0000-0000-000000000001',
  })
  id: string;

  @ApiProperty({
    description: 'Identifier of the user holding this role assignment (UUID).',
    example: '1f0d2f2e-6f0a-4a2f-9f6b-2d1c9a3b7e11',
  })
  userId: string;

  @ApiProperty({
    description: 'The assigned access role.',
    enum: ['RESEARCHER', 'ADMIN'],
    example: 'ADMIN',
  })
  role: string;

  @ApiProperty({
    description: 'Source that granted the role (MANUAL or SYSTEM).',
    enum: ['MANUAL', 'SYSTEM'],
    example: 'MANUAL',
  })
  grantSource: string;

  @ApiProperty({
    description: 'Identifier of the administrator who granted the role.',
    example: 'a0000000-0000-0000-0000-000000000001',
    type: 'string',
    nullable: true,
  })
  grantedBy: string | null;

  @ApiProperty({
    description: 'Timestamp when the role was granted.',
    example: '2026-11-06T12:00:00.000Z',
  })
  grantedAt: string;

  @ApiProperty({
    description: 'Identifier of the administrator who revoked the role.',
    example: 'a0000000-0000-0000-0000-000000000001',
    type: 'string',
    nullable: true,
  })
  revokedBy: string | null;

  @ApiProperty({
    description:
      'Timestamp when the role was revoked, or null if currently active.',
    example: null,
    type: 'string',
    nullable: true,
  })
  revokedAt: string | null;

  @ApiProperty({
    description: 'Administrative reason given when granting or revoking.',
    example: 'Assigned as laboratory administrator.',
    type: 'string',
    nullable: true,
  })
  reason: string | null;
}
