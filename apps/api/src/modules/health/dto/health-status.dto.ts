import { ApiProperty } from '@nestjs/swagger';

export class HealthStatusDto {
  @ApiProperty({
    example: 'ok',
    description: 'ok when healthy, degraded when a dependency is unreachable',
  })
  status: string;

  @ApiProperty({
    example: 'researchos-api',
    description: 'Name of the service that answered the probe.',
  })
  service: string;

  @ApiProperty({ example: 42, description: 'Process uptime in seconds' })
  uptimeSeconds: number;

  @ApiProperty({
    example: '2026-10-29T01:30:00.000Z',
    description: 'ISO timestamp of when the probe answered.',
  })
  timestamp: string;
}
