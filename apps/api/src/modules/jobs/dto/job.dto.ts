import { ApiProperty } from '@nestjs/swagger';

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
    description: 'Execution attempts in the current generation.',
    minimum: 0,
    maximum: 3,
  })
  attempts!: number;

  @ApiProperty({ description: 'Owner-scoped URL to poll for this job.' })
  statusUrl!: string;
}
