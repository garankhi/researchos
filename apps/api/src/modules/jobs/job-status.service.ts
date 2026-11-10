import { Inject, Injectable } from '@nestjs/common';
import { BackgroundJobsService, PrismaService } from '@researchos/database';
import {
  DIGEST_SEND_JOB,
  DURABLE_PROBE_JOB,
  digestDeliveryId,
} from '@researchos/queue';
import type { CreateProbeDto } from './dto/create-probe.dto.js';
import type { JobDto } from './dto/job.dto.js';

@Injectable()
export class JobStatusService {
  constructor(
    @Inject(BackgroundJobsService) private readonly jobs: BackgroundJobsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async createProbe(ownerId: string, dto: CreateProbeDto): Promise<JobDto> {
    return this.toDto(
      await this.jobs.submit(ownerId, DURABLE_PROBE_JOB, dto.idempotencyKey, {
        failuresBeforeSuccess: dto.failuresBeforeSuccess ?? 0,
      }),
    );
  }

  async findOwned(ownerId: string, id: string): Promise<JobDto> {
    return this.toDto(await this.jobs.findOwned(ownerId, id));
  }

  async retryOwned(ownerId: string, id: string): Promise<JobDto> {
    return this.toDto(await this.jobs.retryOwned(ownerId, id));
  }

  private async toDto(job: {
    id: string;
    owner_id: string;
    kind: string;
    payload: unknown;
    status: string;
    attempts: number;
  }): Promise<JobDto> {
    const deliveryId =
      job.kind === DIGEST_SEND_JOB ? digestDeliveryId(job.payload) : undefined;
    const delivery = deliveryId
      ? await this.prisma.digest_deliveries.findFirst({
          where: { id: deliveryId, user_id: job.owner_id },
          select: { attempts: true },
        })
      : null;
    return {
      id: job.id,
      status: job.status,
      attempts: delivery?.attempts ?? job.attempts,
      statusUrl: `/jobs/${job.id}`,
    };
  }
}
