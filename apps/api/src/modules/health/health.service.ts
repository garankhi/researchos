import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { HealthStatusDto } from './dto/health-status.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness probe. Answers as long as the process is running; it does not
   * touch the database, so a database outage does not cause the orchestrator
   * to restart an otherwise healthy API.
   */
  check(): HealthStatusDto {
    return {
      status: 'ok',
      service: 'researchos-api',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe. Unlike the liveness probe, this one actually queries the
   * database, so it reports `degraded` when the database is unreachable
   * instead of failing the request outright. That keeps the probe useful
   * while a database is being migrated or restored.
   */
  async checkReadiness(): Promise<HealthStatusDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        service: 'researchos-api',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        status: 'degraded',
        service: 'researchos-api',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    }
  }
}
