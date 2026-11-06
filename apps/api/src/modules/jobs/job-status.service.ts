import { Inject, Injectable } from '@nestjs/common';
import { BackgroundJobsService } from '@researchos/database';
import { DURABLE_PROBE_JOB } from '@researchos/queue';
import type { CreateProbeDto } from './dto/create-probe.dto.js';
import type { JobDto } from './dto/job.dto.js';

@Injectable()
export class JobStatusService {
  constructor(
    @Inject(BackgroundJobsService) private readonly jobs: BackgroundJobsService,
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

  private toDto(job: { id: string; status: string; attempts: number }): JobDto {
    return {
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      statusUrl: `/jobs/${job.id}`,
    };
  }
}
