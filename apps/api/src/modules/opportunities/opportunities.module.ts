import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller.js';
import { OpportunitiesService } from './opportunities.service.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';

@Module({
  controllers: [OpportunitiesController, ApplicationsController],
  providers: [OpportunitiesService, ApplicationsService],
})
export class OpportunitiesModule {}
