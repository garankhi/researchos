import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { GroupMembersController } from './group-members.controller.js';
import { GroupMembersService } from './group-members.service.js';

/**
 * Module providing research group management endpoints (`research_groups`).
 */
@Module({
  imports: [IdentityModule],
  controllers: [GroupsController, GroupMembersController],
  providers: [GroupsService, GroupMembersService],
  exports: [GroupsService],
})
export class GroupsModule {}
