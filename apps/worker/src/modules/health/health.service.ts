import { Injectable } from '@nestjs/common';
import type { HealthStatus } from './dto/health-status.dto.js';

@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'researchos-worker',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
