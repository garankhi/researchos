import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import {
  DIGEST_SCHEDULER_JOB,
  DIGEST_SCHEDULER_QUEUE,
  DigestScheduler,
} from '../modules/notifications/digest-scheduler.service.js';

@Processor(DIGEST_SCHEDULER_QUEUE)
export class DigestSchedulerProcessor extends WorkerHost {
  constructor(
    @Inject(DigestScheduler) private readonly scheduler: DigestScheduler,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== DIGEST_SCHEDULER_JOB) {
      throw new UnrecoverableError('Invalid digest scheduler tick');
    }
    await this.scheduler.schedule(new Date());
  }
}
