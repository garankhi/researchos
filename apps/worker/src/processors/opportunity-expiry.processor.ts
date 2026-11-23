import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { OPPORTUNITY_EXPIRY_JOB } from '@researchos/database';
import {
  OPPORTUNITY_EXPIRY_QUEUE,
  OpportunityExpiryService,
} from '../modules/jobs/opportunity-expiry.service.js';

@Processor(OPPORTUNITY_EXPIRY_QUEUE)
export class OpportunityExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(OpportunityExpiryProcessor.name);

  constructor(
    @Inject(OpportunityExpiryService)
    private readonly expiry: OpportunityExpiryService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== OPPORTUNITY_EXPIRY_JOB || !job.id) {
      throw new UnrecoverableError('Invalid opportunity expiry tick');
    }
    await this.expiry.enqueue(job.id);
  }

  @OnWorkerEvent('failed')
  onFailed(job?: Job) {
    this.logger.warn({
      event: 'opportunity_expiry_tick_failed',
      attempt: job?.attemptsMade,
    });
  }
}
