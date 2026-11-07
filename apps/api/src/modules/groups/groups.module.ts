import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';

/**
 * Module providing research group management endpoints (`research_groups`).
 */
@Module({
  imports: [IdentityModule],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
