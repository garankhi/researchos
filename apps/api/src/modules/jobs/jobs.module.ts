import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';
import { JobsController } from './jobs.controller.js';
import { JobStatusService } from './job-status.service.js';

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobStatusService],
  exports: [JobsService],
})
export class JobsModule {}
