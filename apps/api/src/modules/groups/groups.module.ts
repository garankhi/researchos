import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { GroupMembersController } from './group-members.controller.js';
import { GroupMembersService } from './group-members.service.js';
import { GroupDirectionsController } from './group-directions.controller.js';
import { GroupDirectionsService } from './group-directions.service.js';
import { GroupOutputLinksController } from './group-output-links.controller.js';
import { GroupOutputLinksService } from './group-output-links.service.js';

/**
 * Module providing research group management endpoints (`research_groups`).
 */
@Module({
  imports: [IdentityModule],
  controllers: [
    GroupsController,
    GroupMembersController,
    GroupDirectionsController,
    GroupOutputLinksController,
  ],
  providers: [
    GroupsService,
    GroupMembersService,
    GroupDirectionsService,
    GroupOutputLinksService,
  ],
  exports: [GroupsService],
})
export class GroupsModule {}
