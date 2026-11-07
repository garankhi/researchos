import { Module } from '@nestjs/common';
import { SessionGuard } from '../../common/guards/session.guard.js';
import { OpportunitiesController } from './opportunities.controller.js';
import { OpportunitiesService } from './opportunities.service.js';

@Module({
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService, SessionGuard],
})
export class OpportunitiesModule {}
