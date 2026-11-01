import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import {
  PROBE_JOB,
  SYSTEM_QUEUE,
  type ProbePayload,
  type ProbeResult,
} from '@researchos/queue';

/** A harmless infrastructure probe: no email, external calls or domain writes. */
@Processor(SYSTEM_QUEUE, { concurrency: 2 })
export class ProbeProcessor extends WorkerHost {
  private readonly logger = new Logger(ProbeProcessor.name);

  async process(job: Job<ProbePayload, ProbeResult>): Promise<ProbeResult> {
    if (
      job.name !== PROBE_JOB ||
      typeof job.data?.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(job.data.requestId) ||
      !Number.isInteger(job.data.failuresBeforeSuccess) ||
      job.data.failuresBeforeSuccess < 0 ||
      job.data.failuresBeforeSuccess > 3
    ) {
      throw new UnrecoverableError('Unsupported job or invalid probe payload');
    }
    if (job.attemptsMade < job.data.failuresBeforeSuccess) {
      throw new Error('Queue probe simulated transient failure');
    }
    await job.updateProgress(100);
    return {
      requestId: job.data.requestId,
      workerPid: process.pid,
      attempt: job.attemptsMade + 1,
      processedAt: new Date().toISOString(),
    };
  }

  @OnWorkerEvent('error')
  onError(error: Error): void {
    this.logger.error(error.message);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.warn(`Job ${job?.id ?? 'unknown'} failed: ${error.message}`);
  }
}
