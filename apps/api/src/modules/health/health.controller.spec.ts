import { Test } from '@nestjs/testing';
import { PrismaService } from '@researchos/database';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/**
 * The service depends on `PrismaService`. The unit test replaces it with a
 * stub so it neither opens a connection nor needs database credentials.
 */
class PrismaServiceStub {
  constructor(private readonly failing = false) {}

  $queryRaw(): Promise<unknown> {
    return this.failing
      ? Promise.reject(new Error('database unreachable'))
      : Promise.resolve([{ '?column?': 1 }]);
  }
}

function createController(prisma: PrismaServiceStub): Promise<HealthController> {
  return Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: PrismaService, useValue: prisma },
    ],
  })
    .compile()
    .then((app) => app.get<HealthController>(HealthController));
}

describe('HealthController', () => {
  describe('check', () => {
    it('should report the service as ok', async () => {
      const healthController = await createController(new PrismaServiceStub());

      const result = healthController.check();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('researchos-api');
    });

    it('should report a non-negative uptime', async () => {
      const healthController = await createController(new PrismaServiceStub());

      expect(healthController.check().uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkReadiness', () => {
    it('should report ok when the database answers', async () => {
      const healthController = await createController(new PrismaServiceStub());

      const result = await healthController.checkReadiness();

      expect(result.status).toBe('ok');
    });

    it('should report degraded when the database is unreachable', async () => {
      const healthController = await createController(new PrismaServiceStub(true));

      const result = await healthController.checkReadiness();

      expect(result.status).toBe('degraded');
    });
  });
});
