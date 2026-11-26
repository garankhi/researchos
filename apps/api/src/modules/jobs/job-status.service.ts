import { Inject, Injectable } from '@nestjs/common';
import { BackgroundJobsService, PrismaService } from '@researchos/database';
import {
  DIGEST_SEND_JOB,
  DURABLE_PROBE_JOB,
  LLKH_EXPORT_JOB,
  TOPIC_SUGGESTION_JOB,
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

  async findAccessible(callerId: string, id: string): Promise<JobDto> {
    return this.toDto(await this.jobs.findAccessible(callerId, id));
  }

  async retryAccessible(callerId: string, id: string): Promise<JobDto> {
    return this.toDto(await this.jobs.retryAccessible(callerId, id));
  }

  private async toDto(job: {
    id: string;
    owner_id: string | null;
    kind: string;
    payload: unknown;
    status: string;
    attempts: number;
    result: unknown;
  }): Promise<JobDto> {
    const deliveryId =
      job.kind === DIGEST_SEND_JOB ? digestDeliveryId(job.payload) : undefined;
    const delivery =
      deliveryId && job.owner_id
        ? await this.prisma.digest_deliveries.findFirst({
            where: { id: deliveryId, user_id: job.owner_id },
            select: { attempts: true },
          })
        : null;
    // Suggestion processing ends at its deadline, even before the retention sweep.
    const expiredSuggestion =
      job.kind === TOPIC_SUGGESTION_JOB && job.status === 'PENDING'
        ? await this.prisma.topic_suggestion_requests.findFirst({
            where: { job_id: job.id, deadline_at: { lte: new Date() } },
            select: { job_id: true },
          })
        : null;
    const exportLevel =
      job.kind === LLKH_EXPORT_JOB && job.status === 'COMPLETED'
        ? (job.result as { exportLevel?: unknown } | null)?.exportLevel
        : undefined;
    return {
      id: job.id,
      status: expiredSuggestion ? 'COMPLETED' : job.status,
      attempts: delivery?.attempts ?? job.attempts,
      statusUrl: `/jobs/${job.id}`,
      ...(exportLevel === 1 || exportLevel === 2 ? { exportLevel } : {}),
    };
  }
}
