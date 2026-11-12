import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { GroupMembersController } from './group-members.controller.js';
import { GroupMembersService } from './group-members.service.js';
import { GroupDirectionsController } from './group-directions.controller.js';
import { GroupDirectionsService } from './group-directions.service.js';

/**
 * Module providing research group management endpoints (`research_groups`).
 */
@Module({
  imports: [IdentityModule],
  controllers: [
    GroupsController,
    GroupMembersController,
    GroupDirectionsController,
  ],
  providers: [GroupsService, GroupMembersService, GroupDirectionsService],
  exports: [GroupsService],
})
export class GroupsModule {}
