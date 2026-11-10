import { ApiProperty } from '@nestjs/swagger';
import { DIGEST_MAX_ATTEMPTS } from '@researchos/queue';

export class JobDto {
  @ApiProperty({
    description: 'Durable logical job identifier.',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description:
      'PENDING includes queued, running and retrying work; terminal states are persisted in PostgreSQL.',
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
  })
  status!: string;

  @ApiProperty({
    description:
      'Lifetime processing attempts for digest jobs. For other jobs, execution attempts in the current generation.',
    minimum: 0,
    maximum: DIGEST_MAX_ATTEMPTS,
  })
  attempts!: number;

  @ApiProperty({ description: 'Owner-scoped URL to poll for this job.' })
  statusUrl!: string;
}
